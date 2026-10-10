import { knownCost } from '@/features/money/spend';
import type { Spend } from '@/features/money/types';
import { clockOf, durationText } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { formatMoney } from '@/lib/theme';
import type { DayClosure, DayEndMode } from './types';

/**
 * Done for today (prototype screen 14). Pure rules: when the day's stops are finished, what the
 * Today tab shows then, who has closed their day, and the planned-vs-actual summary.
 */

const MIN = 60_000;
/** A last stop without an end time counts as finished this long after it starts. */
export const DEFAULT_STAY_MIN = 60;
/** Arriving up to this late is on time (the running-late rule's 5 min). */
const ON_TIME_MIN = 5;

type TimedStop = Pick<Stop, 'status' | 'planned_time' | 'planned_end'>;

/** When a stop is planned to end (ms): its end time, else 60 min after it starts; null without a time. */
export function plannedEndOf(s: Pick<Stop, 'planned_time' | 'planned_end'>): number | null {
  if (s.planned_end) return Date.parse(s.planned_end);
  return s.planned_time ? Date.parse(s.planned_time) + DEFAULT_STAY_MIN * MIN : null;
}

/**
 * The day's last stop is finished: the group left it (or tapped "We're done here" there), or its
 * planned end has passed. `dayStops` = the day's stops still in the plan, in order (sortStops).
 * A stop added after it becomes the last one, so the day is open again until that one is finished.
 */
export function dayFinished(dayStops: TimedStop[], t: number): boolean {
  const last = dayStops[dayStops.length - 1];
  if (!last) return false;
  if (last.status === 'done') return true;
  const end = plannedEndOf(last);
  return end != null && t >= end;
}

/** What the Today tab shows at the end of the day. Closing wins; nothing before the last stop is finished. */
export function dayEndMode({ finished, keptGoing, closed }: { finished: boolean; keptGoing: boolean; closed: boolean }): DayEndMode {
  if (closed) return 'closed';
  if (!finished) return 'hidden';
  return keptGoing ? 'keep-going' : 'ask';
}

/**
 * Closures that count at time t: closed, and not "later" than the fake time in Demo mode
 * (Reset moves the clock back, which reopens the day, like the spend check's answers).
 */
export function closuresAt(rows: DayClosure[], t: number): DayClosure[] {
  return rows.filter((r) => r.closed && Date.parse(r.closed_at) <= t);
}

/** Members who have closed this day at time t. */
export function closedIds(rows: DayClosure[], day: number, t: number): Set<string> {
  return new Set(closuresAt(rows, t).filter((r) => r.day_number === day).map((r) => r.member_id));
}

/** "2 of 4 have closed their day" / "You've closed your day" (solo). */
export function closedCountLabel(closed: number, groupSize: number): string {
  if (groupSize <= 1) return closed > 0 ? "You've closed your day" : 'Close your day when you are done';
  return `${closed} of ${groupSize} have closed their day`;
}

/**
 * Location sharing for a trip day: inside the sharing window, until this person closes the day.
 * After that it starts again with the next day's window (60 min before its first stop).
 */
export function shareNow(window: { from: number; to: number } | null, t: number, closed: boolean): boolean {
  return !closed && !!window && t >= window.from && t <= window.to;
}

// ---------- How today went ----------

export type ReviewMark = 'done' | 'late' | 'missed';

/** One line of "How today went": planned on the left, what happened on the right. */
export interface ReviewRow {
  id: string;
  name: string;
  mark: ReviewMark;
  /** Crossed out: dropped from the plan or skipped. */
  struck: boolean;
  /** "Planned 09:30 · ~RM 16". */
  planned: string;
  /** "12:05 – 12:50", "10:30", "Skipped", "Dropped", "Visited". */
  actual: string;
  /** "1 h late" when they arrived more than 5 min after the planned time. */
  late: string | null;
  /** Final spend: "RM 18" once answered, the plan's "~RM 16" if not, null when not visited. */
  spent: string | null;
}

export interface DayReview {
  rows: ReviewRow[];
  visited: number;
  total: number;
  /** "~RM 60": every stop still in the plan at its price. */
  planned: string;
  /** "RM 52": the visited stops at their final spend (the guess where not answered). */
  spent: string;
}

type ReviewStop = Pick<
  Stop,
  | 'id'
  | 'name'
  | 'status'
  | 'planned_time'
  | 'planned_end'
  | 'position'
  | 'arrived_at'
  | 'left_at'
  | 'price'
  | 'is_estimate'
  | 'is_booked'
  | 'category'
  | 'actual_cost'
>;

const visitedStop = (s: ReviewStop) => s.status === 'arrived' || s.status === 'done' || !!s.arrived_at;

/** Planned vs actual for every stop of the day, dropped ones too, in time order. `mine` = this person's answers. */
export function dayReview(dayStops: ReviewStop[], mine: Map<string, Spend>): DayReview {
  const time = (s: ReviewStop) => (s.planned_time ? Date.parse(s.planned_time) : Infinity);
  const sorted = [...dayStops].sort((a, b) => time(a) - time(b) || a.position - b.position);
  let plannedSum = 0;
  let plannedGuess = false;
  let spentSum = 0;
  let spentGuess = false;

  const rows = sorted.map((s): ReviewRow => {
    const price = Number(s.price) || 0;
    const dropped = s.status === 'dropped';
    if (!dropped) {
      plannedSum += price;
      plannedGuess ||= s.is_estimate;
    }
    const planned = ['Planned', [clockOf(s.planned_time), formatMoney(price, s.is_estimate)].filter(Boolean).join(' · ')].join(' ');
    if (!visitedStop(s)) {
      return {
        id: s.id,
        name: s.name,
        mark: 'missed',
        struck: true,
        planned,
        actual: dropped ? 'Dropped' : 'Skipped',
        late: null,
        spent: null,
      };
    }
    const known = knownCost(s, mine.get(s.id));
    spentSum += known ?? price;
    spentGuess ||= known == null && s.is_estimate;
    const lateMin =
      s.arrived_at && s.planned_time ? Math.round((Date.parse(s.arrived_at) - Date.parse(s.planned_time)) / MIN) : 0;
    const arrived = clockOf(s.arrived_at);
    const left = clockOf(s.left_at);
    return {
      id: s.id,
      name: s.name,
      mark: lateMin > ON_TIME_MIN ? 'late' : 'done',
      struck: false,
      planned,
      actual: arrived && left ? `${arrived} – ${left}` : arrived || 'Visited',
      late: lateMin > ON_TIME_MIN ? `${durationText(lateMin)} late` : null,
      spent: known != null ? formatMoney(known) : formatMoney(price, s.is_estimate),
    };
  });

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    rows,
    visited: rows.filter((r) => r.mark !== 'missed').length,
    total: rows.length,
    planned: formatMoney(round(plannedSum), plannedGuess),
    spent: formatMoney(round(spentSum), spentGuess),
  };
}

/** "07:00": when sharing comes back on for a day (60 min before its first stop), or null. */
export function sharingBackAt(dayStops: Pick<Stop, 'planned_time'>[]): string | null {
  const first = dayStops.map((s) => (s.planned_time ? Date.parse(s.planned_time) : NaN)).filter((t) => !Number.isNaN(t));
  if (first.length === 0) return null;
  return clockOf(new Date(Math.min(...first) - 60 * MIN).toISOString());
}
