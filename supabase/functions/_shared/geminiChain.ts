// The Gemini model chain for generate-trip-options and generate-itinerary.
// Free tier limits are per model (e.g. 5 a minute, 20 a day), so instead of one
// model the functions walk a list, best first:
// - "used up" (daily quota reached, model not found / not available) -> marked in
//   the gemini_used_up table until midnight Pacific time (when Google resets free
//   limits) and skipped by every later request that day;
// - "busy" (rate limited for the minute, overloaded) -> next model, not marked;
// - other errors (timeout, 500) -> next model.
// An answer that fails our JSON checks makes the caller ask again: that goes to the
// NEXT model. If every model left is busy, wait 3 s and try those once more, then
// AiBusyError (the function answers status 'busy'). If every model is used up, AiUsedUpError
// (status 'limit'). Never sample options / plans.
// No imports, so React Native (tests) and Deno can both use it.

/** Best first. Overridden by the GEMINI_MODELS secret (comma-separated). IDs from ai.google.dev/gemini-api/docs/models. */
export const DEFAULT_GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
];

/** The model list: GEMINI_MODELS ("a, b, c") when set, else the default. */
export function geminiModels(env: string | null | undefined): string[] {
  const list = (env ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return list.length ? [...new Set(list)] : [...DEFAULT_GEMINI_MODELS];
}

/** Gemma models take no JSON mode: the instructions go in the prompt and the JSON is read from the text. */
export const isGemma = (model: string) => /^gemma/i.test(model);

/** A Gemini call that got an HTTP error back. */
export class GeminiHttpError extends Error {
  model: string;
  status: number;
  body: string;
  constructor(model: string, status: number, body: string) {
    super(`${model} ${status}: ${body.slice(0, 300)}`);
    this.model = model;
    this.status = status;
    this.body = body;
  }
}

export type FailureKind = 'used-up' | 'busy' | 'error';

/**
 * What a failed call means for the model:
 * used-up = daily quota reached, or the model is not found / not available (skip it until midnight Pacific);
 * busy = only rate limited for the minute, or overloaded (try again later);
 * error = anything else (skip it for this request only).
 */
export function classifyFailure(status: number, body: string): FailureKind {
  const text = body.toLowerCase().replace(/[\s_-]/g, '');
  if (status === 404) return 'used-up';
  if (status === 429) {
    // quotaId e.g. "GenerateRequestsPerDayPerProjectPerModel-FreeTier"; "limit: 0" = no free tier for this model.
    if (/perday|daily|limit:0\b/.test(text)) return 'used-up';
    return 'busy';
  }
  if ((status === 400 || status === 403) && /notfound|notavailable|nolongeravailable|notsupported|unsupportedmodel|deprecated|shutdown|notenabled/.test(text)) {
    return 'used-up';
  }
  if (status === 503) return 'busy';
  return 'error';
}

function pacificParts(ms: number): { y: number; m: number; d: number; h: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24 };
}

/** The next midnight in Pacific time (when Google resets free limits), in ms. */
export function nextPacificMidnight(nowMs: number): number {
  const { y, m, d } = pacificParts(nowMs);
  // Midnight Pacific is 07:00 UTC in summer (PDT) and 08:00 UTC in winter (PST).
  for (const h of [7, 8]) {
    const t = Date.UTC(y, m - 1, d + 1, h);
    if (pacificParts(t).h === 0) return t;
  }
  return Date.UTC(y, m - 1, d + 1, 8);
}

/** Every model left is rate limited for the minute (after one 3 s wait). */
export class AiBusyError extends Error {
  aiStatus = 'busy' as const;
  constructor() {
    super('Our AI is busy right now');
  }
}

/** Every model is used up for today. */
export class AiUsedUpError extends Error {
  aiStatus = 'used-up' as const;
  constructor() {
    super('Every Gemini model is used up for today');
  }
}

/** Answer text -> the JSON in it: drops ```json fences and any words around the object. */
export function jsonText(text: string): string {
  const t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : t;
  if (body.startsWith('{') || body.startsWith('[')) return body;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export interface ChainDeps {
  models: string[];
  /** One call to one model; throws GeminiHttpError on an HTTP error. */
  call: (model: string, prompt: string) => Promise<string>;
  /** Models marked used up and not yet reset. */
  usedUp: () => Promise<Set<string>>;
  /** Mark a model used up until `until` (ms). */
  markUsedUp: (model: string, until: number, reason: string) => Promise<void>;
  now: () => number;
  wait: (ms: number) => Promise<void>;
  log: (message: string) => void;
  /** Stop starting new calls after this long (the function's own time limit is 150 s). Default 110 s. */
  budgetMs?: number;
}

export const BUSY_WAIT_MS = 3000;

/**
 * One request's walk down the model list. `ask(prompt)` returns the first answer;
 * a second `ask` (after a bad answer) starts at the model after the one that answered.
 * `model` is the model that gave the last answer.
 */
export function geminiChain(deps: ChainDeps) {
  const started = deps.now();
  const budget = deps.budgetMs ?? 110_000;
  let next = 0;
  let waited = false;
  let usedUp: Set<string> | null = null;
  const failed = new Set<string>(); // errors this request only
  const state = { model: null as string | null, ask };

  async function tryModel(model: string, prompt: string, busy: string[]): Promise<string | null> {
    try {
      const text = await deps.call(model, prompt);
      state.model = model;
      deps.log(`Gemini answered with ${model}`);
      return text;
    } catch (e) {
      const kind = e instanceof GeminiHttpError ? classifyFailure(e.status, e.body) : 'error';
      const why = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      deps.log(`${model} failed (${kind}): ${why}`);
      if (kind === 'used-up') {
        usedUp!.add(model);
        await deps.markUsedUp(model, nextPacificMidnight(deps.now()), why).catch((err) =>
          deps.log(`Could not mark ${model} used up: ${err instanceof Error ? err.message : err}`),
        );
      } else if (kind === 'busy') busy.push(model);
      else failed.add(model);
      return null;
    }
  }

  async function ask(prompt: string): Promise<string> {
    if (!usedUp) {
      usedUp = await deps.usedUp().catch((e) => {
        deps.log(`Could not read used-up models: ${e instanceof Error ? e.message : e}`);
        return new Set<string>();
      });
      const skipped = deps.models.filter((m) => usedUp!.has(m));
      if (skipped.length) deps.log(`Used up today, skipped: ${skipped.join(', ')}`);
    }
    const outOfTime = () => deps.now() - started > budget;
    const busy: string[] = [];
    for (let i = next; i < deps.models.length; i++) {
      const model = deps.models[i];
      if (usedUp.has(model) || failed.has(model)) continue;
      if (outOfTime()) break;
      const text = await tryModel(model, prompt, busy);
      if (text !== null) {
        next = i + 1;
        return text;
      }
    }
    if (busy.length && !waited && !outOfTime()) {
      waited = true;
      deps.log(`Every model left is busy (${busy.join(', ')}), waiting ${BUSY_WAIT_MS / 1000} s`);
      await deps.wait(BUSY_WAIT_MS);
      const again = [...busy];
      busy.length = 0;
      for (const model of again) {
        if (outOfTime()) break;
        const text = await tryModel(model, prompt, busy);
        if (text !== null) {
          next = deps.models.indexOf(model) + 1;
          return text;
        }
      }
    }
    next = deps.models.length; // nothing answered: a later ask doesn't walk the list again
    if (busy.length) throw new AiBusyError();
    if (deps.models.every((m) => usedUp!.has(m))) throw new AiUsedUpError();
    throw new Error('No Gemini model gave an answer');
  }

  return state;
}
