// The Gemini model chain with fake Gemini answers. No real API calls.
import {
  AiBusyError,
  AiUsedUpError,
  BUSY_WAIT_MS,
  classifyFailure,
  DEFAULT_GEMINI_MODELS,
  GeminiHttpError,
  geminiChain,
  geminiModels,
  jsonText,
  nextPacificMidnight,
  type ChainDeps,
} from '@/supabase/functions/_shared/geminiChain';
import { planItinerary, type ItineraryInput } from '@/supabase/functions/_shared/itinerary';
import { planTripOptions, type TripOptionsRequest } from '@/supabase/functions/_shared/tripOptions';

// Google's real 429 bodies, shortened.
const PER_DAY = JSON.stringify({
  error: {
    code: 429,
    message: 'You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 20',
    details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }],
  },
});
const PER_MINUTE = JSON.stringify({
  error: {
    code: 429,
    message: 'You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 5',
    details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { retryDelay: '37s' }],
  },
});
const NOT_FOUND = '{"error":{"code":404,"message":"models/gemini-2.0-flash is not found for API version v1beta"}}';

type Reply = string | { status: number; body: string } | Error;

/** Fake models: each one answers from its own list of replies (the last reply repeats). */
function fakeChain(replies: Record<string, Reply[]>, opts: { usedUp?: string[]; usedUpFails?: boolean; now?: number } = {}) {
  const calls: string[] = [];
  const marked: { model: string; until: number }[] = [];
  const waits: number[] = [];
  const logs: string[] = [];
  const seen: Record<string, number> = {};
  const deps: ChainDeps = {
    models: Object.keys(replies),
    call: async (model) => {
      calls.push(model);
      const list = replies[model] ?? [new Error('no fake reply')];
      const reply = list[Math.min(seen[model] ?? 0, list.length - 1)];
      seen[model] = (seen[model] ?? 0) + 1;
      if (reply instanceof Error) throw reply;
      if (typeof reply === 'string') return reply;
      throw new GeminiHttpError(model, reply.status, reply.body);
    },
    usedUp: async () => {
      if (opts.usedUpFails) throw new Error('db down');
      return new Set(opts.usedUp ?? []);
    },
    markUsedUp: async (model, until) => {
      marked.push({ model, until });
    },
    now: () => opts.now ?? Date.UTC(2026, 9, 12, 3, 0),
    wait: async (ms) => {
      waits.push(ms);
    },
    log: (m) => logs.push(m),
  };
  return { chain: geminiChain(deps), calls, marked, waits, logs };
}

const daily = { status: 429, body: PER_DAY };
const minute = { status: 429, body: PER_MINUTE };
const gone = { status: 404, body: NOT_FOUND };

describe('model list', () => {
  it('uses the default order, best first, ending with Gemma', () => {
    expect(geminiModels(undefined)).toEqual(DEFAULT_GEMINI_MODELS);
    expect(DEFAULT_GEMINI_MODELS[0]).toBe('gemini-3.8-flash');
    expect(DEFAULT_GEMINI_MODELS.slice(-2)).toEqual(['gemma-4-31b-it', 'gemma-4-26b-a4b-it']);
  });

  it('lets GEMINI_MODELS (comma-separated) override it', () => {
    expect(geminiModels(' gemini-2.5-flash, gemma-4-31b-it ,,gemini-2.5-flash')).toEqual(['gemini-2.5-flash', 'gemma-4-31b-it']);
    expect(geminiModels('  ')).toEqual(DEFAULT_GEMINI_MODELS);
  });
});

describe('classifyFailure', () => {
  it('tells a used-up day from a busy minute', () => {
    expect(classifyFailure(429, PER_DAY)).toBe('used-up');
    expect(classifyFailure(429, PER_MINUTE)).toBe('busy');
    expect(classifyFailure(429, 'Resource has been exhausted')).toBe('busy'); // unknown: don't lose the model for the day
    expect(classifyFailure(429, '{"message":"Quota exceeded, limit: 0, model: gemini-2.5-pro"}')).toBe('used-up');
  });

  it('treats not found / not available as used up', () => {
    expect(classifyFailure(404, NOT_FOUND)).toBe('used-up');
    expect(classifyFailure(400, 'This model is not available for new users')).toBe('used-up');
    expect(classifyFailure(403, 'Model is no longer available')).toBe('used-up');
  });

  it('treats overloaded as busy and other errors as plain errors', () => {
    expect(classifyFailure(503, 'The model is overloaded')).toBe('busy');
    expect(classifyFailure(500, 'Internal error')).toBe('error');
    expect(classifyFailure(400, 'Invalid JSON payload')).toBe('error');
  });
});

describe('nextPacificMidnight', () => {
  it('is 07:00 UTC in summer (PDT)', () => {
    expect(new Date(nextPacificMidnight(Date.UTC(2026, 9, 12, 3, 0))).toISOString()).toBe('2026-10-12T07:00:00.000Z');
    expect(new Date(nextPacificMidnight(Date.UTC(2026, 9, 12, 7, 0))).toISOString()).toBe('2026-10-13T07:00:00.000Z');
  });

  it('is 08:00 UTC in winter (PST)', () => {
    expect(new Date(nextPacificMidnight(Date.UTC(2026, 11, 1, 20, 0))).toISOString()).toBe('2026-12-02T08:00:00.000Z');
  });

  it('handles the night the clocks go back', () => {
    // 1 Nov 2026 is PDT at midnight, PST by the next midnight.
    expect(new Date(nextPacificMidnight(Date.UTC(2026, 10, 1, 12, 0))).toISOString()).toBe('2026-11-02T08:00:00.000Z');
  });
});

describe('jsonText', () => {
  it('reads JSON out of fences and words (Gemma)', () => {
    expect(jsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(jsonText('Here is the plan:\n{"a":{"b":2}}\nEnjoy!')).toBe('{"a":{"b":2}}');
    expect(jsonText(' {"a":1} ')).toBe('{"a":1}');
  });
});

describe('geminiChain', () => {
  it('uses the first model when it answers', async () => {
    const f = fakeChain({ 'm-1': ['{"ok":1}'], 'm-2': ['{"ok":2}'] });
    await expect(f.chain.ask('p')).resolves.toBe('{"ok":1}');
    expect(f.calls).toEqual(['m-1']);
    expect(f.chain.model).toBe('m-1');
    expect(f.logs).toContain('Gemini answered with m-1');
  });

  it('marks a model used up until midnight Pacific when its daily quota is reached, and goes to the next', async () => {
    const f = fakeChain({ 'm-1': [daily], 'm-2': [gone], 'm-3': ['{"ok":3}'] });
    await expect(f.chain.ask('p')).resolves.toBe('{"ok":3}');
    expect(f.calls).toEqual(['m-1', 'm-2', 'm-3']);
    expect(f.marked).toEqual([
      { model: 'm-1', until: Date.UTC(2026, 9, 12, 7) },
      { model: 'm-2', until: Date.UTC(2026, 9, 12, 7) },
    ]);
    expect(f.chain.model).toBe('m-3');
    expect(f.waits).toEqual([]);
  });

  it('never calls a model already used up today', async () => {
    const f = fakeChain({ 'm-1': ['{"ok":1}'], 'm-2': ['{"ok":2}'] }, { usedUp: ['m-1'] });
    await expect(f.chain.ask('p')).resolves.toBe('{"ok":2}');
    expect(f.calls).toEqual(['m-2']);
  });

  it('does not mark a model rate limited for the minute', async () => {
    const f = fakeChain({ 'm-1': [minute], 'm-2': ['{"ok":2}'] });
    await expect(f.chain.ask('p')).resolves.toBe('{"ok":2}');
    expect(f.marked).toEqual([]);
  });

  it('skips a model that errors (timeout, 500) without marking it', async () => {
    const f = fakeChain({ 'm-1': [new Error('timed out')], 'm-2': [{ status: 500, body: 'oops' }], 'm-3': ['{"ok":3}'] });
    await expect(f.chain.ask('p')).resolves.toBe('{"ok":3}');
    expect(f.marked).toEqual([]);
  });

  it('asks the NEXT model after a bad answer', async () => {
    const f = fakeChain({ 'm-1': ['not json'], 'm-2': ['{"ok":2}'], 'm-3': ['{"ok":3}'] });
    await f.chain.ask('p');
    await expect(f.chain.ask('p again')).resolves.toBe('{"ok":2}');
    expect(f.calls).toEqual(['m-1', 'm-2']);
    expect(f.chain.model).toBe('m-2');
  });

  it('waits 3 s once when every model left is busy, then tries the busy ones again', async () => {
    const f = fakeChain({ 'm-1': [minute, '{"ok":1}'], 'm-2': [daily], 'm-3': [{ status: 503, body: 'overloaded' }] });
    await expect(f.chain.ask('p')).resolves.toBe('{"ok":1}');
    expect(f.waits).toEqual([BUSY_WAIT_MS]);
    expect(BUSY_WAIT_MS).toBe(3000);
    expect(f.calls).toEqual(['m-1', 'm-2', 'm-3', 'm-1']); // m-2 is used up, not tried again
  });

  it('throws AiBusyError when every model is still busy after the wait', async () => {
    const f = fakeChain({ 'm-1': [minute], 'm-2': [minute] });
    await expect(f.chain.ask('p')).rejects.toBeInstanceOf(AiBusyError);
    expect(f.waits).toEqual([BUSY_WAIT_MS]);
    expect(f.calls).toEqual(['m-1', 'm-2', 'm-1', 'm-2']);
    expect(f.marked).toEqual([]);
  });

  it('throws AiUsedUpError when every model is used up for today', async () => {
    const f = fakeChain({ 'm-1': [daily], 'm-2': [gone] });
    await expect(f.chain.ask('p')).rejects.toBeInstanceOf(AiUsedUpError);
    expect(f.waits).toEqual([]);
  });

  it('throws AiUsedUpError without any call when all were used up earlier today', async () => {
    const f = fakeChain({ 'm-1': ['{"ok":1}'] }, { usedUp: ['m-1'] });
    await expect(f.chain.ask('p')).rejects.toBeInstanceOf(AiUsedUpError);
    expect(f.calls).toEqual([]);
  });

  it('keeps going when the used-up table cannot be read', async () => {
    const f = fakeChain({ 'm-1': ['{"ok":1}'] }, { usedUpFails: true });
    await expect(f.chain.ask('p')).resolves.toBe('{"ok":1}');
    expect(f.logs).toContain('Could not read used-up models: db down');
  });
});

// The chain inside the real planners.
const req: TripOptionsRequest = {
  destination: null,
  lengthMin: 2,
  lengthMax: 3,
  members: [{ dailyBudget: 200, foodNeeds: [], mustHaves: ['Beach'], noGo: null }],
  freeDates: [['2026-10-11', '2026-10-12', '2026-10-13']],
  totalMembers: 1,
};
const option = (name: string) => ({
  name, days: 3, costPerPerson: 400, tags: ['Beach'], covers: ['Beach'], avoids: [], halal: true, scene: 'beach',
  dayTitles: ['A', 'B', 'C'], landmark: name,
});
const goodOptions = JSON.stringify({ options: ['Penang', 'Langkawi', 'Ipoh', 'Melaka'].map(option) });

describe('planTripOptions with the model chain', () => {
  const plan = (f: ReturnType<typeof fakeChain>) =>
    planTripOptions(req, { ask: (p) => f.chain.ask(p), findPhoto: null });

  it('retries a bad JSON answer once on the next model', async () => {
    const f = fakeChain({ 'm-1': ['{"options": "nope"}'], 'm-2': [goodOptions], 'm-3': [goodOptions] });
    const result = await plan(f);
    expect(result.status).toBe('ok');
    expect(f.calls).toEqual(['m-1', 'm-2']);
    expect(f.chain.model).toBe('m-2');
  });

  it('works with a Gemma-style answer once the JSON is read from the text', async () => {
    const f = fakeChain({ 'gemma-4-31b-it': [jsonText(`Sure! Here you go:\n\`\`\`json\n${goodOptions}\n\`\`\``)] });
    expect((await plan(f)).status).toBe('ok');
  });

  it('answers busy (never samples) after two bad answers', async () => {
    const f = fakeChain({ 'm-1': ['nope'], 'm-2': ['nope'], 'm-3': [goodOptions] });
    const result = await plan(f);
    expect(result).toMatchObject({ status: 'busy', options: [] });
    expect(f.calls).toEqual(['m-1', 'm-2']); // only one retry
  });

  it('returns busy (no samples) when every model is busy', async () => {
    const f = fakeChain({ 'm-1': [minute], 'm-2': [{ status: 503, body: 'overloaded' }] });
    const result = await plan(f);
    expect(result.status).toBe('busy');
    expect(result.options).toEqual([]);
    expect(f.waits).toEqual([BUSY_WAIT_MS]);
  });

  it('returns limit (no samples) when every model is used up for today', async () => {
    const f = fakeChain({ 'm-1': [daily], 'm-2': [gone] });
    const result = await plan(f);
    expect(result).toMatchObject({ status: 'limit', options: [], note: null });
  });
});

describe('planItinerary with the model chain', () => {
  const input: ItineraryInput = {
    destination: 'Penang', days: 1, dayTitles: [], halal: false, startDate: '2026-10-12', members: [], budget: null,
  };
  const plan = (f: ReturnType<typeof fakeChain>) => planItinerary(input, { ask: (p) => f.chain.ask(p), findPlace: null });

  it('returns busy (no samples) when every model is busy', async () => {
    const f = fakeChain({ 'm-1': [minute] });
    const result = await plan(f);
    expect(result.status).toBe('busy');
    expect(result.stops).toEqual([]);
  });

  it('returns limit (no sample plan) when every model is used up for today', async () => {
    const f = fakeChain({ 'm-1': [daily] });
    const result = await plan(f);
    expect(result).toMatchObject({ status: 'limit', stops: [], note: null });
  });
});
