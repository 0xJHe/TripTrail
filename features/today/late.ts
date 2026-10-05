import type { Stop } from '@/features/planning/types';
import { CHECK_BEFORE_MIN, isLate, type CheckKind } from '@/supabase/functions/_shared/eta';
import { remainingFrom, ruleBasedNewDay } from '@/supabase/functions/_shared/newDay';
import type { LateAlert, NewLateAlert } from './types';

/**
 * Running late (CLAUDE.md "Key logic"), the parts that decide when to check and what
 * to show. Pure functions; useLateCheck feeds them the time, stops and travel time.
 * - Check the next stop once ~30 min before it starts, if the group isn't there yet.
 * - Check once more when the group leaves a stop, if the next one starts in under 30 min.
 * - Only before the stop's planned start: it's an early warning, never after the fact.
 * - At most 2 checks per stop (one of each); one late card per stop.
 */

const MIN = 60_000;

/** The next stop can be checked: still planned, with a time and a place. */
export function checkable(s: Stop | null): s is Stop & { planned_time: string; lat: number; lng: number } {
  return !!s && s.status === 'planned' && s.planned_time != null && s.lat != null && s.lng != null;
}

/** When the group last left a stop today (ISO), up to `now`. */
export function lastLeftAt(dayStops: Pick<Stop, 'left_at'>[], now: number): string | null {
  return dayStops.reduce<string | null>((best, s) => {
    if (!s.left_at || Date.parse(s.left_at) > now) return best;
    return !best || Date.parse(s.left_at) > Date.parse(best) ? s.left_at : best;
  }, null);
}

/** Checks due now for the next stop (none once both were done, or once it has started). */
export function dueChecks(input: {
  /** Planned start of the next stop (ms). */
  startsAt: number;
  /** When the group last left a stop (ISO), or null. */
  lastLeft: string | null;
  now: number;
  done: ReadonlySet<CheckKind>;
}): CheckKind[] {
  const { startsAt, lastLeft, now, done } = input;
  const due: CheckKind[] = [];
  if (now >= startsAt) return due;
  if (!done.has('before') && now >= startsAt - CHECK_BEFORE_MIN * MIN) due.push('before');
  const left = lastLeft ? Date.parse(lastLeft) : null;
  if (!done.has('left') && left != null && left < startsAt && startsAt - left < CHECK_BEFORE_MIN * MIN) due.push('left');
  return due;
}

/**
 * The late card to save, or null if the group will make it in time.
 * `dayStops` = all of the day's stops (the new day is made from the planned ones from `next` on).
 */
export function lateAlertFor(input: {
  tripId: string;
  next: Stop & { planned_time: string };
  dayStops: Stop[];
  now: number;
  travelMin: number;
  source: LateAlert['travel_source'];
}): NewLateAlert | null {
  const { tripId, next, dayStops, now, travelMin, source } = input;
  const startsAt = Date.parse(next.planned_time);
  if (!isLate(now, travelMin, startsAt)) return null;
  const plan = ruleBasedNewDay({ stops: remainingFrom(dayStops, next.id), arriveAt: now + travelMin * MIN });
  return {
    stop_id: next.id,
    trip_id: tripId,
    day_number: next.day_number,
    checked_at: new Date(now).toISOString(),
    travel_min: travelMin,
    travel_source: source,
    starts_at: next.planned_time,
    plan,
  };
}

/** The open card for the stop the group is heading to, if there is one. */
export function openAlertFor(alerts: LateAlert[], next: Stop | null): LateAlert | null {
  if (!next || next.status !== 'planned') return null;
  return alerts.find((a) => a.stop_id === next.id && a.status === 'open') ?? null;
}

/**
 * Stops as they were before any accepted new day (times and dropped stops put back).
 * Demo mode builds its fake route from these, so accepting doesn't move the replay.
 */
export function beforeNewDays<T extends Pick<Stop, 'id' | 'planned_time' | 'planned_end' | 'status'>>(
  stops: T[],
  alerts: LateAlert[],
): T[] {
  const accepted = alerts
    .filter((a) => a.status === 'accepted' && a.original)
    .sort((a, b) => Date.parse(b.checked_at) - Date.parse(a.checked_at));
  if (accepted.length === 0) return stops;
  const before = new Map<string, NonNullable<LateAlert['original']>[number]>();
  // Latest first, so a stop changed twice ends with its first times.
  for (const a of accepted) for (const o of a.original!) before.set(o.id, o);
  return stops.map((s) => {
    const o = before.get(s.id);
    if (!o) return s;
    return {
      ...s,
      planned_time: o.planned_time,
      planned_end: o.planned_end,
      status: s.status === 'dropped' ? o.status : s.status,
    };
  });
}
