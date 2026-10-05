// Running late: the suggested new day. Simple rules by default (no AI, made on the
// phone), and the Gemini version for "Ask AI for a better plan" (replan-day Edge
// Function). Both come out in the same shape with the same labels.
// Plain TypeScript with no imports: it has to run in both React Native and Deno.

const MIN = 60_000;
/** A shortened stop keeps at least this long, or half its time if that's more. */
export const MIN_STAY_MIN = 30;
/** Squeezed shorter than this before a fixed stop: drop it instead. */
export const MIN_KEEP_MIN = 15;
/** The day should end by 22:00. */
export const DAY_ENDS_HOUR = 22;
/** Stay used for a stop with no end time (or until the next stop, if that's sooner). */
export const DEFAULT_STAY_MIN = 60;
/** The AI plan may start the late stop up to this much before the group gets there. */
const ARRIVE_SLACK_MIN = 5;

export const NOTES = {
  nextSlot: 'next slot',
  shortened: 'shortened',
  moved: 'moved',
  fixed: 'fixed time',
  lowest: 'lowest priority',
  noTime: 'no time left',
} as const;

/** A stop still to visit today, as the new-day rules see it. Times in ms. */
export interface PlanStop {
  id: string;
  name: string;
  start: number;
  /** null = no end time set. */
  end: number | null;
  /** Per person, RM. */
  price: number;
  /** Booked (hotel, flights) or a meal: never moved or dropped. */
  fixed: boolean;
  /** 1 = drop first ... 3 = keep. */
  priority: number;
  category: string | null;
  outdoor: boolean;
}

/** One line of the suggested day. */
export interface NewDayItem {
  stopId: string;
  name: string;
  /** New ISO times (end null when the stop has no end time). */
  start: string;
  end: string | null;
  /** Shown after the name, e.g. "next slot", "shortened", "lowest priority". */
  note: string | null;
  dropped: boolean;
}

/** The suggested new day: kept stops by time, then the dropped ones. */
export interface NewDay {
  source: 'rules' | 'ai';
  items: NewDayItem[];
  /** RM per person; negative = cheaper (dropped stops aren't paid for). */
  costChange: number;
  /** End of the last kept stop (ISO). */
  endsAt: string | null;
}

/** New times for one stop, before labels are added. */
export interface Proposal {
  id: string;
  start: number;
  end: number;
  dropped: boolean;
  reason?: string | null;
}

/** The parts of a `stops` row turned into a PlanStop. */
export interface StopRow {
  id: string;
  name: string;
  planned_time: string | null;
  planned_end: string | null;
  price: number | string | null;
  is_booked: boolean | null;
  is_outdoor: boolean | null;
  category: string | null;
  priority: number | null;
  status: string | null;
}

const FIXED_CATEGORIES = ['flight', 'hotel', 'food'];

/** Booked stops (hotel, flights) and meals never move. */
export function isFixed(s: Pick<StopRow, 'is_booked' | 'category'>): boolean {
  return !!s.is_booked || FIXED_CATEGORIES.includes(s.category ?? '');
}

/**
 * The stops a new day is made of: still planned, with a time, in time order, from
 * the late stop on. Empty if the late stop isn't one of them.
 */
export function remainingFrom(rows: StopRow[], lateId: string): PlanStop[] {
  const timed = rows
    .filter((r) => r.status === 'planned' && r.planned_time)
    .sort((a, b) => Date.parse(a.planned_time!) - Date.parse(b.planned_time!));
  const at = timed.findIndex((r) => r.id === lateId);
  if (at < 0) return [];
  return timed.slice(at).map((r) => ({
    id: r.id,
    name: r.name,
    start: Date.parse(r.planned_time!),
    end: r.planned_end ? Date.parse(r.planned_end) : null,
    price: Number(r.price ?? 0) || 0,
    fixed: isFixed(r),
    priority: r.priority ?? 2,
    category: r.category,
    outdoor: !!r.is_outdoor,
  }));
}

/** Planned end, filling in a missing one (an hour, or until the next stop if sooner). */
function plannedEnd(s: PlanStop, next: PlanStop | undefined): number {
  if (s.end != null && s.end > s.start) return s.end;
  const hour = s.start + DEFAULT_STAY_MIN * MIN;
  return next ? Math.max(s.start + MIN_KEEP_MIN * MIN, Math.min(hour, next.start)) : hour;
}

const roundUp5 = (ms: number) => Math.ceil(ms / (5 * MIN)) * 5 * MIN;

/** Shortest a stop may be squeezed to: 30 min or half its time, never more than it had. */
const minStay = (stay: number) => Math.min(stay, Math.max(MIN_STAY_MIN * MIN, Math.round(stay / 2 / MIN) * MIN));

/** Lay the stops out: late stop at the arrival time, delay passed on, absorbed by shortening. */
function schedule(stops: PlanStop[], arriveAt: number): Proposal[] {
  const ends = stops.map((s, i) => plannedEnd(s, stops[i + 1]));
  const out: Proposal[] = [];
  let prev = -1; // index of the last kept stop
  stops.forEach((s, i) => {
    const stay = ends[i] - s.start;
    if (i === 0) {
      const start = s.fixed ? s.start : Math.max(s.start, roundUp5(arriveAt));
      out.push({ id: s.id, start, end: start + stay, dropped: false });
      prev = 0;
      return;
    }
    const p = out[prev];
    // How much later the stop before now ends, minus the free time there was before this one.
    const gap = Math.max(0, s.start - ends[prev]);
    const delay = p.end - ends[prev] - gap;
    if (delay <= 0) {
      out.push({ id: s.id, start: s.start, end: ends[i], dropped: false });
    } else if (s.fixed) {
      // Can't move: the stop before gives up its time instead.
      out.push({ id: s.id, start: s.start, end: ends[i], dropped: false });
      p.end = Math.max(p.start, s.start - gap);
      if (p.end - p.start < MIN_KEEP_MIN * MIN) {
        p.dropped = true;
        p.reason = NOTES.noTime;
      }
    } else {
      const start = s.start + delay;
      const least = minStay(stay);
      const end = delay <= stay - least ? ends[i] : start + least;
      out.push({ id: s.id, start, end, dropped: false });
    }
    prev = i;
  });
  return out;
}

const lastEnd = (props: Proposal[]) =>
  props.filter((p) => !p.dropped).reduce<number | null>((m, p) => (m == null || p.end > m ? p.end : m), null);

/**
 * The simple-rules new day (no AI):
 * - the late stop moves to when the group will get there ("next slot");
 * - later stops with spare time are shortened to absorb the delay ("shortened");
 * - if the day would end after 22:00, the lowest-priority stops are dropped ("lowest priority");
 * - booked stops (hotel, flights) and meals never move.
 * `stops` = remainingFrom(...): the late stop first. `dayEndsAt` = 22:00 that day (ms).
 */
export function ruleBasedNewDay(input: { stops: PlanStop[]; arriveAt: number; dayEndsAt: number }): NewDay {
  const { stops, arriveAt, dayEndsAt } = input;
  if (stops.length === 0) return { source: 'rules', items: [], costChange: 0, endsAt: null };
  const dropped = new Set<string>();
  let props: Proposal[] = [];
  for (;;) {
    const kept = stops.filter((s) => !dropped.has(s.id));
    props = schedule(kept, arriveAt);
    const end = lastEnd(props);
    if (end == null || end <= dayEndsAt) break;
    const squeezed = new Set(props.filter((p) => p.dropped).map((p) => p.id));
    const candidate = kept
      .filter((s, i) => i > 0 && !s.fixed && !squeezed.has(s.id))
      .sort((a, b) => a.priority - b.priority || b.start - a.start)[0];
    if (!candidate) break;
    dropped.add(candidate.id);
  }
  const ends = new Map(stops.map((s, i) => [s.id, plannedEnd(s, stops[i + 1])]));
  const gone: Proposal[] = stops
    .filter((s) => dropped.has(s.id))
    .map((s) => ({ id: s.id, start: s.start, end: ends.get(s.id)!, dropped: true, reason: NOTES.lowest }));
  return toNewDay(stops, [...props, ...gone], stops[0].id, 'rules');
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Add the labels and the cost change. Used for both the rules and the AI plan. */
export function toNewDay(original: PlanStop[], props: Proposal[], lateId: string, source: NewDay['source']): NewDay {
  const byId = new Map(original.map((s, i) => [s.id, { s, end: plannedEnd(s, original[i + 1]) }]));
  const items: NewDayItem[] = [];
  const kept = props.filter((p) => !p.dropped && byId.has(p.id)).sort((a, b) => a.start - b.start);
  for (const p of kept) {
    const { s, end } = byId.get(p.id)!;
    let note: string | null = null;
    if (s.fixed) note = p.id === lateId ? NOTES.fixed : null;
    else if (p.id === lateId && p.start > s.start) note = NOTES.nextSlot;
    else if (p.end - p.start < end - s.start - MIN) note = NOTES.shortened;
    else if (p.start !== s.start) note = NOTES.moved;
    items.push({ stopId: s.id, name: s.name, start: iso(p.start), end: s.end == null ? null : iso(p.end), note, dropped: false });
  }
  const gone = props.filter((p) => p.dropped && byId.has(p.id)).sort((a, b) => byId.get(a.id)!.s.start - byId.get(b.id)!.s.start);
  for (const p of gone) {
    const { s } = byId.get(p.id)!;
    items.push({
      stopId: s.id,
      name: s.name,
      start: iso(s.start),
      end: s.end == null ? null : iso(s.end),
      note: p.reason || NOTES.lowest,
      dropped: true,
    });
  }
  const saved = gone.reduce((sum, p) => sum + byId.get(p.id)!.s.price, 0);
  const end = lastEnd(kept);
  return { source, items, costChange: saved === 0 ? 0 : -Math.round(saved), endsAt: end == null ? null : iso(end) };
}

// ---------------------------------------------------------------------------
// "Ask AI for a better plan": prompt, checks and retry. Gemini comes in as a dep
// so tests can use fake answers.

export interface ReplanInput {
  /** Current time and when the group gets to the late stop (ms). */
  now: number;
  arriveAt: number;
  travelMin: number;
  /** Where the group is, if known. */
  here: { lat: number; lng: number } | null;
  /** Remaining stops, the late stop first (remainingFrom). */
  stops: PlanStop[];
  /** 22:00 on the day (ms). */
  dayEndsAt: number;
  /** Phone's offset from UTC in minutes (Malaysia = 480), for the "HH:MM" times. */
  tzOffsetMin: number;
  /** Lowest daily budget in the group, RM per person; null if nobody set one. */
  dailyBudget: number | null;
  halal: boolean;
  foodNeeds: string[];
  mustHaves: string[];
  noGo: string[];
}

export interface ReplanDeps {
  /** Ask Gemini; `attempt` is 0 or 1. Null when there's no API key. */
  ask: ((prompt: string, attempt: number) => Promise<string>) | null;
  log?: (message: string) => void;
}

export interface ReplanResult {
  plan: NewDay | null;
  geminiCalls: number;
}

/** What the replan-day function replies. */
export interface ReplanReply {
  plan: NewDay | null;
  /** Small note when there's no AI plan, e.g. the daily limit. */
  note: string | null;
  limited: boolean;
  geminiCalls: number;
}

export const AI_FAILED_NOTE = "Couldn't get an AI plan right now, so this is the simple one.";
export const AI_LIMIT_NOTE = "Today's 5 AI re-plans are used up, so this is the simple one.";

const pad2 = (n: number) => String(n).padStart(2, '0');
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" of a time on the phone's clock. */
export function clockAt(ms: number, tzOffsetMin: number): string {
  const d = new Date(ms + tzOffsetMin * MIN);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** "HH:MM" on the same (phone-local) day as `ref` -> ms; null if it isn't a time. */
export function msAtClock(text: unknown, ref: number, tzOffsetMin: number): number | null {
  if (typeof text !== 'string') return null;
  const m = CLOCK.exec(text.trim());
  if (!m) return null;
  const local = new Date(ref + tzOffsetMin * MIN);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - tzOffsetMin * MIN;
  return midnight + (Number(m[1]) * 60 + Number(m[2])) * MIN;
}

/** 22:00 on the phone-local day of `ref` (ms). */
export function dayEndOn(ref: number, tzOffsetMin: number): number {
  return msAtClock(`${DAY_ENDS_HOUR}:00`, ref, tzOffsetMin)!;
}

export function buildReplanPrompt(input: ReplanInput, feedback?: string): string {
  const t = (ms: number) => clockAt(ms, input.tzOffsetMin);
  const late = input.stops[0];
  const lines = input.stops
    .map((s, i) => {
      const end = plannedEnd(s, input.stops[i + 1]);
      const fixed = s.fixed ? ', FIXED (booked or a meal): keep this exact time' : '';
      return `- id "${s.id}": ${s.name}, ${t(s.start)}-${t(end)}, RM ${s.price}, ${s.category ?? 'sight'}, ${s.outdoor ? 'outdoor' : 'indoor'}, priority ${s.priority}${fixed}`;
    })
    .join('\n');
  const here = input.here ? ` They are at ${input.here.lat.toFixed(4)},${input.here.lng.toFixed(4)}.` : '';
  const food = input.halal
    ? 'Someone needs halal food: every food stop must stay halal.'
    : `Food needs: ${input.foodNeeds.join(', ') || 'none'}.`;
  return `You re-plan the rest of a group's day in a travel app used in Malaysia. Prices are in Malaysian ringgit (RM), per person.

The group is running late. It is ${t(input.now)} now.${here} They need about ${input.travelMin} min to get to "${late.name}", so they arrive about ${t(input.arriveAt)}; it was planned for ${t(late.start)}.

Stops left today, in plan order (priority 1 = drop first, 3 = keep):
${lines}

The group: daily budget ${input.dailyBudget != null ? `RM ${input.dailyBudget}` : 'not set'} per person. ${food} Must-haves: ${input.mustHaves.join(', ') || 'none'}. No-go: ${input.noGo.join(', ') || 'none'}.

Rules:
- Use only the stops above. No new stops. You may change start and end times, shorten stops, or drop stops.
- FIXED stops keep their exact start and end and are never dropped.
- "${late.name}" can't start before ${t(input.arriveAt)}, unless you drop it.
- Stops must not overlap; leave time to travel between them.
- Everything must end by ${pad2(DAY_ENDS_HOUR)}:00.
- Keep the group's must-haves; drop low-priority stops first; never keep anything that is someone's no-go.
- Never make the day cost more.
- "start" and "end": 24-hour "HH:MM". "reason": 2 to 4 words, only when "drop" is true.
${feedback ? `\nYour last answer had a problem: ${feedback}\nFix it.\n` : ''}
Reply with JSON only, no other text, with every stop above once, in this shape:
{"stops":[{"id":"${late.id}","start":"10:30","end":"12:00","drop":false,"reason":""}]}`;
}

function fail(message: string): never {
  throw new Error(message);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Check Gemini's answer and turn it into new times. Throws a plain reason (sent back
 * to Gemini on the retry) when it can't be used. Fixed stops always keep their times.
 */
export function checkReplan(text: string, input: ReplanInput): Proposal[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('The answer was not valid JSON.');
  }
  if (!isObj(raw) || !Array.isArray(raw.stops)) fail('The answer needs a "stops" list.');
  const answers = new Map<string, Record<string, unknown>>();
  for (const a of raw.stops as unknown[]) if (isObj(a) && typeof a.id === 'string') answers.set(a.id, a);

  const t = (ms: number) => clockAt(ms, input.tzOffsetMin);
  const late = input.stops[0];
  const out: Proposal[] = input.stops.map((s, i) => {
    const end = plannedEnd(s, input.stops[i + 1]);
    if (s.fixed) return { id: s.id, start: s.start, end, dropped: false };
    const a = answers.get(s.id) ?? fail(`"${s.name}" (id "${s.id}") is missing.`);
    if (a.drop === true) {
      const reason = typeof a.reason === 'string' && a.reason.trim() ? a.reason.trim().slice(0, 30).toLowerCase() : NOTES.lowest;
      return { id: s.id, start: s.start, end, dropped: true, reason };
    }
    const start = msAtClock(a.start, s.start, input.tzOffsetMin) ?? fail(`"${s.name}" needs a start time like 10:30.`);
    const finish = msAtClock(a.end, s.start, input.tzOffsetMin) ?? fail(`"${s.name}" needs an end time like 12:00.`);
    if (finish <= start) fail(`"${s.name}" ends before it starts.`);
    if (start < input.arriveAt - ARRIVE_SLACK_MIN * MIN) {
      fail(
        s.id === late.id
          ? `"${s.name}" can't start before ${t(input.arriveAt)}, when the group gets there.`
          : `"${s.name}" starts at ${t(start)}, before the group even reaches "${late.name}" at ${t(input.arriveAt)}.`,
      );
    }
    return { id: s.id, start, end: finish, dropped: false };
  });

  const kept = out.filter((p) => !p.dropped).sort((a, b) => a.start - b.start);
  const name = (id: string) => input.stops.find((s) => s.id === id)!.name;
  const fixed = (id: string) => input.stops.find((s) => s.id === id)!.fixed;
  for (let i = 1; i < kept.length; i++) {
    const a = kept[i - 1];
    const b = kept[i];
    if (b.start < a.end && !(fixed(a.id) && fixed(b.id))) fail(`"${name(b.id)}" starts before "${name(a.id)}" ends.`);
  }
  const end = lastEnd(kept);
  if (end != null && end > input.dayEndsAt) fail(`The day ends at ${t(end)}; it must end by ${pad2(DAY_ENDS_HOUR)}:00.`);
  return out;
}

/** Gemini gets two tries (the second with the problem explained); null plan if both fail. Never throws. */
export async function replanWithAi(input: ReplanInput, deps: ReplanDeps): Promise<ReplanResult> {
  let geminiCalls = 0;
  if (!deps.ask || input.stops.length === 0) return { plan: null, geminiCalls };
  let feedback: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      geminiCalls++;
      const props = checkReplan(await deps.ask(buildReplanPrompt(input, feedback), attempt), input);
      return { plan: toNewDay(input.stops, props, input.stops[0].id, 'ai'), geminiCalls };
    } catch (e) {
      feedback = e instanceof Error ? e.message : String(e);
      deps.log?.(`replan-day attempt ${attempt + 1} failed: ${feedback}`);
    }
  }
  return { plan: null, geminiCalls };
}
