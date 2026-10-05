// Running late: the suggested new day, made on the phone with simple rules (no AI).
// Plain TypeScript with no imports, like the rest of _shared.

const MIN = 60_000;
/** A shortened stop keeps at least this long, or half its time if that's more. */
export const MIN_STAY_MIN = 30;
/** Squeezed shorter than this before a booked stop: drop it instead. */
export const MIN_KEEP_MIN = 15;
/** The new day may end this much after the original plan's end before a stop is dropped. */
export const OVERRUN_MIN = 30;
/** Stay used for a stop with no end time (or until the next stop, if that's sooner). */
export const DEFAULT_STAY_MIN = 60;

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
  /** Booked (hotel, flights): never moved or dropped. */
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
  items: NewDayItem[];
  /** RM per person; negative = cheaper (dropped stops aren't paid for). */
  costChange: number;
  /** End of the last kept stop (ISO). */
  endsAt: string | null;
}

/** New times for one stop, before labels are added. */
interface Proposal {
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

const FIXED_CATEGORIES = ['flight', 'hotel'];

/** Booked stops (hotel, flights) never move. Meals do. */
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
      // Booked, can't move: the stop before gives up its time instead.
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
 * The suggested new day (simple rules, no AI):
 * - the late stop moves to when the group will get there ("next slot"), even a meal;
 * - later stops shift if needed; ones with spare time are shortened to absorb the delay ("shortened");
 * - if the day would still end more than 30 min after the original plan's end (today's last
 *   stop), the lowest-priority stops are dropped ("lowest priority");
 * - only booked stops (hotel, flights) never move.
 * `stops` = remainingFrom(...): the late stop first, through today's last stop.
 */
export function ruleBasedNewDay(input: { stops: PlanStop[]; arriveAt: number }): NewDay {
  const { stops, arriveAt } = input;
  if (stops.length === 0) return { items: [], costChange: 0, endsAt: null };
  const originalEnd = Math.max(...stops.map((s, i) => plannedEnd(s, stops[i + 1])));
  const latestEnd = originalEnd + OVERRUN_MIN * MIN;
  const dropped = new Set<string>();
  let props: Proposal[] = [];
  for (;;) {
    const kept = stops.filter((s) => !dropped.has(s.id));
    props = schedule(kept, arriveAt);
    const end = lastEnd(props);
    if (end == null || end <= latestEnd) break;
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
  return toNewDay(stops, [...props, ...gone], stops[0].id);
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Add the labels and the cost change. */
function toNewDay(original: PlanStop[], props: Proposal[], lateId: string): NewDay {
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
  return { items, costChange: saved === 0 ? 0 : -Math.round(saved), endsAt: end == null ? null : iso(end) };
}
