import type { NewStop, Stop } from '@/features/planning/types';
import type { LatLng } from '@/lib/distance';
import { aheadMinutes, EARLY_AHEAD_MIN, estimateMinutes, paceFor, spareMinutes } from '@/supabase/functions/_shared/eta';
import { fillMinutes, legMinutes, type NearbySuggestion } from '@/supabase/functions/_shared/nearby';
import { isFixed, remainingFrom, ruleBasedNewDay } from '@/supabase/functions/_shared/newDay';
import { checkable } from './late';
import type { EarlyAlert, LateAlert, NewEarlyAlert, StopTimes } from './types';

/**
 * Running early (CLAUDE.md "Key logic"), the parts that decide when to show the card and
 * what its buttons change. Pure functions; useEarlyCheck feeds them the time and position.
 * - Checked when the group leaves a stop (or taps "We're done here").
 * - Ahead = that stop's planned end − when they left: the number on the card. Needs 15+ min.
 * - Spare = next stop's start − now − travel (straight line at 25 km/h), the same calculation
 *   as running late (spareMinutes / paceFor in _shared/eta.ts). Needs 30+ min; it sizes
 *   "Add this" and the suggestion. Never when there is no next stop today.
 * - Running late always wins: no early card for a stop that has a late card (whatever was
 *   decided), and an open late card hides an early one.
 * - Once per stop the group is heading to.
 */

const MIN = 60_000;
/** A leave older than this isn't checked any more (e.g. the app was closed for a while). */
export const LEAVE_FRESH_MIN = 20;
/** An added stop lasts at least this long, even if the group took a while to tap "Add this". */
export const MIN_ADDED_STAY_MIN = 15;
/** "Go to next stop" moves the next stop earlier in 5-minute steps. */
const MOVE_STEP_MIN = 5;

const iso = (ms: number) => new Date(ms).toISOString();

/** The stop the group has just left today (latest left_at, at most 20 min ago), or null. */
export function justLeft<T extends Pick<Stop, 'status' | 'left_at'>>(dayStops: T[], now: number): T | null {
  const left = dayStops
    .filter((s) => s.status === 'done' && s.left_at && Date.parse(s.left_at) <= now)
    .sort((a, b) => Date.parse(b.left_at!) - Date.parse(a.left_at!))[0];
  return left && now - Date.parse(left.left_at!) <= LEAVE_FRESH_MIN * MIN ? left : null;
}

/**
 * How far ahead of the plan the group was when it left `left`: its planned end − when they
 * left (the "You're N minutes ahead" on the card). null without a planned end or a leave.
 */
export function aheadOf(left: Pick<Stop, 'planned_end'> | null, leftAt: string | null): number | null {
  if (!left?.planned_end || !leftAt) return null;
  return aheadMinutes(Date.parse(left.planned_end), Date.parse(leftAt));
}

/**
 * Whether the early card shows for the trip to `next`, with its two figures, else null.
 * All of these must hold:
 * - the group left `left` at least 15 min before its planned end (ahead of the plan);
 * - 30+ min to spare before the next stop (shared spare-time rule, so never "late" too);
 * - next is still planned with a time and a place and hasn't started;
 * - it has no late card (late wins) and no early card yet (once per stop).
 */
export function earlyCheck(input: {
  /** The stop the group just left. */
  left: Pick<Stop, 'planned_end' | 'left_at'> | null;
  next: Stop | null;
  now: number;
  /** Free straight-line estimate to the next stop (estimateMinutes). */
  travelMin: number;
  lateAlerts: Pick<LateAlert, 'stop_id'>[];
  earlyAlerts: Pick<EarlyAlert, 'stop_id'>[];
}): { aheadMin: number; spareMin: number } | null {
  const { left, next, now, travelMin, lateAlerts, earlyAlerts } = input;
  if (!checkable(next)) return null;
  const startsAt = Date.parse(next.planned_time);
  if (now >= startsAt) return null;
  if (lateAlerts.some((a) => a.stop_id === next.id)) return null;
  if (earlyAlerts.some((a) => a.stop_id === next.id)) return null;
  const aheadMin = aheadOf(left, left?.left_at ?? null);
  if (aheadMin == null || aheadMin < EARLY_AHEAD_MIN) return null;
  if (paceFor(now, travelMin, startsAt) !== 'early') return null;
  return { aheadMin, spareMin: Math.floor(spareMinutes(now, travelMin, startsAt)) };
}

/** The early card to save. */
export function earlyAlertFor(input: {
  tripId: string;
  left: Pick<Stop, 'id' | 'left_at'> | null;
  next: Pick<Stop, 'id' | 'day_number'>;
  now: number;
  travelMin: number;
  spareMin: number;
  suggestion: NearbySuggestion | null;
}): NewEarlyAlert {
  const { tripId, left, next, now, travelMin, spareMin, suggestion } = input;
  return {
    stop_id: next.id,
    trip_id: tripId,
    day_number: next.day_number,
    left_stop_id: left?.id ?? null,
    left_at: left?.left_at ?? null,
    checked_at: iso(now),
    spare_min: spareMin,
    travel_min: travelMin,
    suggestion,
  };
}

/** The open early card for the stop the group is heading to, if there is one (never when it has a late card). */
export function openEarlyFor(earlyAlerts: EarlyAlert[], lateAlerts: Pick<LateAlert, 'stop_id'>[], next: Stop | null): EarlyAlert | null {
  if (!next || next.status !== 'planned') return null;
  if (lateAlerts.some((a) => a.stop_id === next.id)) return null;
  return earlyAlerts.find((a) => a.stop_id === next.id && (a.status === 'open' || a.status === 'offer')) ?? null;
}

/** Spare minutes right now: from where the group is, else the saved figure minus the time since. */
export function spareNow(alert: Pick<EarlyAlert, 'spare_min' | 'checked_at'>, next: Stop, here: LatLng | null, now: number): number {
  if (here && checkable(next)) return Math.floor(spareMinutes(now, estimateMinutes(here, next), Date.parse(next.planned_time)));
  return Math.floor(alert.spare_min - Math.max(0, now - Date.parse(alert.checked_at)) / MIN);
}

/**
 * "Add this": the suggestion as a stop starting once the group gets there, lasting the spare
 * time minus walking there and on to the next stop (at most 60 min, at least 15). Later stops
 * only move if it would still run into the next one (simple new-day rules); booked ones never.
 */
export function fillStop(input: {
  suggestion: NearbySuggestion;
  next: Stop & { planned_time: string; lat: number; lng: number };
  dayStops: Stop[];
  here: LatLng;
  now: number;
}): { stop: NewStop; times: StopTimes[] } {
  const { suggestion: s, next, dayStops, here, now } = input;
  const nextStart = Date.parse(next.planned_time);
  const there = legMinutes(here, s);
  const on = legMinutes(s, next);
  const spare = spareMinutes(now, estimateMinutes(here, next), nextStart);
  const stay = Math.max(MIN_ADDED_STAY_MIN, fillMinutes(spare, there, on));
  const start = Math.ceil((now + there * MIN) / MIN) * MIN;
  const end = start + stay * MIN;
  const stop: NewStop = {
    day_number: next.day_number,
    position: next.position,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    planned_time: iso(start),
    planned_end: iso(end),
    price: s.price,
    is_estimate: true,
    is_booked: false,
    is_outdoor: s.outdoor,
    tip: null,
    category: s.category,
    address: null,
    place_id: s.placeId,
  };
  const arriveNext = end + on * MIN;
  if (arriveNext <= nextStart) return { stop, times: [] };
  const plan = ruleBasedNewDay({ stops: remainingFrom(dayStops, next.id), arriveAt: arriveNext });
  const before = new Map(dayStops.map((d) => [d.id, d]));
  const same = (a: string | null, b: string | null) => (a == null || b == null ? a === b : Date.parse(a) === Date.parse(b));
  const times = plan.items
    .filter((i) => !i.dropped)
    .filter((i) => {
      const was = before.get(i.stopId);
      return !!was && (!same(was.planned_time, i.start) || !same(was.planned_end, i.end));
    })
    .map((i) => ({ id: i.stopId, planned_time: i.start, planned_end: i.end }));
  return { stop, times };
}

/**
 * "Go to next stop": the next stop moved earlier by the spare time (in 5-min steps), or null
 * when it can't move (booked) or there's under 5 min to gain.
 */
export function moveEarlier(next: Stop, spareMin: number): StopTimes | null {
  if (!next.planned_time || isFixed(next)) return null;
  const by = Math.floor(spareMin / MOVE_STEP_MIN) * MOVE_STEP_MIN;
  if (by < MOVE_STEP_MIN) return null;
  return {
    id: next.id,
    planned_time: iso(Date.parse(next.planned_time) - by * MIN),
    planned_end: next.planned_end ? iso(Date.parse(next.planned_end) - by * MIN) : null,
  };
}

type Timed = Pick<Stop, 'id' | 'planned_time' | 'planned_end'>;

const decided = (early: EarlyAlert[]) => early.filter((a) => a.status === 'added' || a.status === 'moved');

/** Stops with the times running early gave them (Demo mode's replay follows these). */
export function withEarlyChanges<T extends Timed>(stops: T[], early: EarlyAlert[]): T[] {
  const changed = new Map<string, StopTimes>();
  for (const a of decided(early)) for (const c of a.changed ?? []) changed.set(c.id, c);
  if (changed.size === 0) return stops;
  return stops.map((s) => {
    const c = changed.get(s.id);
    return c ? { ...s, planned_time: c.planned_time, planned_end: c.planned_end } : s;
  });
}

/** Stops before any running-early change: added stops left out, moved times put back (Demo mode picks its moments from these). */
export function beforeEarlyChanges<T extends Timed>(stops: T[], early: EarlyAlert[]): T[] {
  const list = decided(early).sort((a, b) => Date.parse(b.checked_at) - Date.parse(a.checked_at));
  if (list.length === 0) return stops;
  const added = new Set(list.map((a) => a.added_stop_id).filter(Boolean));
  const before = new Map<string, StopTimes>();
  // Latest first, so a stop changed twice ends with its first times.
  for (const a of list) for (const o of a.original ?? []) before.set(o.id, o);
  return stops
    .filter((s) => !added.has(s.id))
    .map((s) => {
      const o = before.get(s.id);
      return o ? { ...s, planned_time: o.planned_time, planned_end: o.planned_end } : s;
    });
}
