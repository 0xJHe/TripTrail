import type { Stop } from './types';

/**
 * Stops whose times overlap on the same day (Add a stop / Edit stop). The check uses this
 * person's view of the plan (useStops: group B's own stops too during a split). "Shift later
 * stops" moves the overlapping stop and the later ones on that day just enough so nothing
 * overlaps, keeping their lengths; booked stops (hotel, flights) never move, and nothing may
 * end at or after midnight.
 */

type TimedStop = Pick<Stop, 'id' | 'name' | 'day_number' | 'planned_time' | 'planned_end' | 'is_booked' | 'status'>;

/** The stop being saved: its id when editing (so it doesn't clash with itself). */
export interface StopTimes {
  id?: string | null;
  day_number: number;
  planned_time: string;
  planned_end: string;
}

/** A stop's new times after shifting (planned_end stays null when it had none). */
export interface StopMove {
  id: string;
  planned_time: string;
  planned_end: string | null;
}

export type OverlapCheck =
  | { ok: true }
  | {
      ok: false;
      /** The first stop (by start time) the new times overlap. */
      with: TimedStop;
      /** What "Shift later stops" saves; null when it can't be offered (see `reason`). */
      moves: StopMove[] | null;
      reason: 'midnight' | 'booked' | null;
    };

export const NO_TIME_LEFT = 'Not enough time left today, please pick another time.';
export const BOOKED_IN_THE_WAY = "Booked stops can't move, please pick another time.";

const startOf = (s: Pick<TimedStop, 'planned_time'>) => Date.parse(s.planned_time!);
/** A stop without an end time is a moment. */
const endOf = (s: Pick<TimedStop, 'planned_time' | 'planned_end'>) => (s.planned_end ? Date.parse(s.planned_end) : startOf(s));

function overlaps(a: { start: number; end: number }, s: TimedStop): boolean {
  const start = startOf(s);
  const end = endOf(s);
  return end > start ? start < a.end && a.start < end : a.start <= start && start < a.end;
}

/** Midnight at the end of the day the stop starts on (phone time). */
function midnightAfter(iso: string): number {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** "This overlaps with Kek Lok Si Temple (10:00–11:30)." */
export function overlapText(stop: Pick<Stop, 'name' | 'planned_time' | 'planned_end'>, clock: (iso: string | null) => string): string {
  const start = clock(stop.planned_time);
  const end = clock(stop.planned_end);
  return `This overlaps with ${stop.name} (${end ? `${start}–${end}` : start}).`;
}

/**
 * Does `stop` overlap another timed stop on its day? If so, the moves that make room: the
 * overlapping stop and every later non-booked one go later by just enough (gaps soak up the
 * shift), lengths kept. None offered if a booked stop is in the way or a stop would run past midnight.
 */
export function checkOverlap(stop: StopTimes, plan: TimedStop[]): OverlapCheck {
  const mine = { start: Date.parse(stop.planned_time), end: Date.parse(stop.planned_end) };
  const day = plan
    .filter((s) => s.id !== stop.id && s.day_number === stop.day_number && s.status !== 'dropped' && s.planned_time)
    .sort((a, b) => startOf(a) - startOf(b) || endOf(a) - endOf(b));
  const first = day.findIndex((s) => overlaps(mine, s));
  if (first < 0) return { ok: true };
  const clash = day[first];
  if (clash.is_booked) return { ok: false, with: clash, moves: null, reason: 'booked' };

  const midnight = midnightAfter(stop.planned_time);
  const moves: StopMove[] = [];
  let free = mine.end;
  for (const s of day.slice(first)) {
    const start = startOf(s);
    const end = endOf(s);
    if (start >= free) {
      free = Math.max(free, end);
      continue;
    }
    if (s.is_booked) return { ok: false, with: clash, moves: null, reason: 'booked' };
    const shift = free - start;
    const newEnd = end + shift;
    if (Math.max(free, newEnd) >= midnight) return { ok: false, with: clash, moves: null, reason: 'midnight' };
    moves.push({
      id: s.id,
      planned_time: new Date(free).toISOString(),
      planned_end: s.planned_end ? new Date(newEnd).toISOString() : null,
    });
    free = Math.max(free, newEnd);
  }
  return { ok: false, with: clash, moves, reason: null };
}
