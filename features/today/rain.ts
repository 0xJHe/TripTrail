import { durationText } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { haversineMeters, type LatLng } from '@/lib/distance';
import type { DemoRoute } from '@/lib/location';
import { legMinutes, type RainOption } from '@/supabase/functions/_shared/nearby';
import { isFixed } from '@/supabase/functions/_shared/newDay';
import { rainWithin, type HourWeather, type Weather } from '@/supabase/functions/_shared/weather';
import type { NewRainAlert, RainAlert } from './types';

/**
 * Rain backup (CLAUDE.md "Key logic", prototype screen 10), the parts that decide when to
 * show the card and what "Go" changes. Pure functions; useRainCheck feeds them the time,
 * the group's position and the weather already fetched.
 * - Rain at the group's position within the next 60 min (Demo mode: the route's rain moment;
 *   otherwise the weather function's current conditions and hourly forecast, no extra call).
 * - For the stop the group is at, if it's outdoor and lasts until the rain comes; else for
 *   the next stop, if it's outdoor and starts before the rain's first hour is over.
 * - Once per stop (rain_alerts, shared by the group). Booked stops never change.
 */

const MIN = 60_000;
/** Rain this soon counts. */
export const RAIN_SOON_MIN = 60;
/** The next stop counts if it starts within this long of the rain coming. */
export const RAIN_HOUR_MIN = 60;
/** A place swapped in at the stop the group is at lasts at least this long. */
export const MIN_SWAP_STAY_MIN = 15;

const iso = (ms: number) => new Date(ms).toISOString();

/** Demo mode: minutes until the route's rain reaches point p (0 = falling), within the hour; else null. */
export function demoRainIn(route: DemoRoute, p: LatLng, t: number): number | null {
  let best: number | null = null;
  for (const r of route.rain) {
    if (r.startsAt > t + RAIN_SOON_MIN * MIN || r.endsAt < t || haversineMeters(p, r) > r.radiusM) continue;
    const m = Math.max(0, Math.ceil((r.startsAt - t) / MIN));
    best = best == null ? m : Math.min(best, m);
  }
  return best;
}

/** Minutes until rain at the group's position within the hour (0 = raining), or null. */
export function rainInMinutes(input: {
  route: DemoRoute | null;
  /** The group's centre (lib/location). */
  center: LatLng | null;
  time: number;
  /** The weather function's last reply: current conditions and the hours ahead. */
  weather: { now: Weather | null; soon?: HourWeather[] } | null;
}): number | null {
  const { route, center, time, weather } = input;
  if (route) return center ? demoRainIn(route, center, time) : null;
  return weather ? rainWithin(weather.now, weather.soon ?? [], time, RAIN_SOON_MIN) : null;
}

type Placed = Stop & { lat: number; lng: number };
const placed = (s: Stop | null): s is Placed => !!s && s.lat != null && s.lng != null;
const changeable = (s: Stop | null): s is Placed => placed(s) && s.is_outdoor && !isFixed(s);

/**
 * The outdoor stop the rain card is for, or null:
 * - the stop the group is at, if it's outdoor and its planned end is after the rain comes;
 * - else the next stop, if it's outdoor, still planned and starts within an hour of the rain;
 * - never a booked stop, never one that already had a rain card.
 */
export function rainTarget(input: {
  now: Stop | null;
  next: Stop | null;
  time: number;
  /** null = no rain within the hour. */
  rainIn: number | null;
  rainAlerts: Pick<RainAlert, 'stop_id'>[];
}): Placed | null {
  const { now, next, time, rainIn, rainAlerts } = input;
  if (rainIn == null) return null;
  const rainAt = time + rainIn * MIN;
  const fresh = (s: Stop) => !rainAlerts.some((a) => a.stop_id === s.id);
  if (changeable(now) && now.status === 'arrived' && fresh(now)) {
    if (!now.planned_end || Date.parse(now.planned_end) > rainAt) return now;
  }
  if (changeable(next) && next.status === 'planned' && next.planned_time && fresh(next)) {
    const ends = next.planned_end ? Date.parse(next.planned_end) : Infinity;
    if (Date.parse(next.planned_time) <= rainAt + RAIN_HOUR_MIN * MIN && ends > rainAt) return next;
  }
  return null;
}

/** When the new place would start (the rain check asks for restaurants only near a meal time). */
export function slotStart(stop: Pick<Stop, 'status' | 'planned_time'>, time: number): number {
  return stop.status === 'arrived' || !stop.planned_time ? time : Math.max(time, Date.parse(stop.planned_time));
}

/** The rain card to save. */
export function rainAlertFor(input: {
  tripId: string;
  stop: Pick<Stop, 'id' | 'day_number'>;
  now: number;
  rainIn: number;
  options: RainOption[];
}): NewRainAlert {
  const { tripId, stop, now, rainIn, options } = input;
  return {
    stop_id: stop.id,
    trip_id: tripId,
    day_number: stop.day_number,
    checked_at: iso(now),
    rain_in_min: rainIn,
    options,
  };
}

/** The open rain card for the stop the group is at, else the next one, with that stop. */
export function openRainFor(alerts: RainAlert[], now: Stop | null, next: Stop | null): { alert: RainAlert; stop: Stop } | null {
  const open = (s: Stop | null, status: Stop['status']) =>
    s && s.status === status ? alerts.find((a) => a.stop_id === s.id && a.status === 'open') : undefined;
  const atNow = open(now, 'arrived');
  if (atNow && now) return { alert: atNow, stop: now };
  const atNext = open(next, 'planned');
  if (atNext && next) return { alert: atNext, stop: next };
  return null;
}

/** Minutes until the rain now (the saved figure minus the time since the check), at least 0. */
export function rainLeft(alert: Pick<RainAlert, 'rain_in_min' | 'checked_at'>, now: number): number {
  return Math.max(0, alert.rain_in_min - Math.floor(Math.max(0, now - Date.parse(alert.checked_at)) / MIN));
}

/** "Rain at Batu Ferringhi beach in 40 min"; "... now" once it's here; no options: "consider moving it". */
export function rainHeadline(stopName: string, minutes: number, hasOptions: boolean): string {
  if (!hasOptions) return `Rain coming at ${stopName} — consider moving it`;
  return minutes <= 0 ? `Rain at ${stopName} now` : `Rain at ${stopName} in ${durationText(minutes)}`;
}

/**
 * What "Go" sends decide_rain. A stop still to come keeps its times (start / end null). At
 * the stop already: it ends now, and the place runs from when the group gets there to the
 * stop's planned end (at least 15 min).
 */
export function swapTimes(input: {
  stop: Pick<Stop, 'status' | 'planned_end'>;
  option: RainOption;
  here: LatLng;
  now: number;
}): { now: string; start: string | null; end: string | null } {
  const { stop, option, here, now } = input;
  if (stop.status !== 'arrived') return { now: iso(now), start: null, end: null };
  const start = Math.ceil((now + legMinutes(here, option) * MIN) / MIN) * MIN;
  const planned = stop.planned_end ? Date.parse(stop.planned_end) : start + 60 * MIN;
  return { now: iso(now), start: iso(start), end: iso(Math.max(planned, start + MIN_SWAP_STAY_MIN * MIN)) };
}

type Swappable = Pick<Stop, 'id' | 'name' | 'lat' | 'lng' | 'is_outdoor' | 'planned_end'>;

/**
 * Stops before any rain swap: added stops left out, swapped stops back to the outdoor place.
 * Demo mode picks the day's moments from these, so tapping "Go" doesn't move them.
 */
export function beforeRainSwaps<T extends Swappable>(stops: T[], alerts: RainAlert[]): T[] {
  const swapped = alerts.filter((a) => a.status === 'swapped' && a.original);
  if (swapped.length === 0) return stops;
  const added = new Set(swapped.map((a) => a.added_stop_id).filter(Boolean));
  const before = new Map(swapped.map((a) => [a.stop_id, a.original!]));
  return stops
    .filter((s) => !added.has(s.id))
    .map((s) => {
      const o = before.get(s.id);
      return o ? { ...s, name: o.name, lat: o.lat, lng: o.lng, is_outdoor: o.is_outdoor, planned_end: o.planned_end } : s;
    });
}
