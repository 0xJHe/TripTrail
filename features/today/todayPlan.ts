import { daysBetween, todayISO, type ISODate } from '@/features/planning/dates';
import { dayDate, durationText } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import type { TripStage } from '@/features/trip/types';
import { haversineMeters, type LatLng } from '@/lib/distance';
import { currentStop } from './arrival';
import type { TodayView } from './types';

const MIN = 60_000;
/** Arriving up to this late still counts as on time (same 5 min as the running-late rule). */
const ON_TIME_MIN = 5;

/** Trip day number for a date (day 1 = start; 0 or less = before the trip). */
export function tripDayOn(start: ISODate, now: Date): number {
  return daysBetween(start, todayISO(now)) + 1;
}

/** "on time" / "12 min behind", from the latest arrival vs its planned time. */
export function paceLabel(stops: Stop[]): string | null {
  const last = stops
    .filter((s) => s.arrived_at && s.planned_time)
    .sort((a, b) => Date.parse(b.arrived_at!) - Date.parse(a.arrived_at!))[0];
  if (!last) return null;
  const late = Math.round((Date.parse(last.arrived_at!) - Date.parse(last.planned_time!)) / MIN);
  return late > ON_TIME_MIN ? `${durationText(late)} behind` : 'on time';
}

interface TodayInput {
  stage: TripStage;
  start: ISODate;
  days: number;
  /** The trip's stops in plan order, dropped ones left out (sortStops). */
  stops: Stop[];
  now: Date;
  /** The trip day to show when it isn't the calendar day (a day kept open past midnight, useOpenDay). */
  day?: number;
}

/** Today's Now / Next / Done from the Day plan, or why there is nothing to show. */
export function todayView({ stage, start, days, stops, now, day: openDay }: TodayInput): TodayView {
  const day = openDay != null && openDay > 0 ? openDay : tripDayOn(start, now);
  const noPlan = (reason: 'not-built' | 'before' | 'after' | 'empty'): TodayView => ({
    kind: 'no-plan',
    reason,
    day,
    startsOn: start,
    endsOn: dayDate(start, days),
    daysToGo: Math.max(0, 1 - day),
  });
  if (stage !== 'decided') return noPlan('not-built');
  if (day < 1) return noPlan('before');
  if (day > days) return noPlan('after');
  const dayStops = stops.filter((s) => s.day_number === day);
  if (dayStops.length === 0) return noPlan('empty');

  const at = currentStop(dayStops);
  // Next = first stop still planned after the furthest one visited (skipped stops stay behind).
  let reached = -1;
  dayStops.forEach((s, i) => {
    if (s.status === 'arrived' || s.status === 'done') reached = i;
  });
  const ahead = dayStops.filter((s, i) => i > reached && s.status === 'planned');

  return {
    kind: 'day',
    day,
    date: dayDate(start, day),
    now: at,
    next: ahead[0] ?? null,
    after: ahead[1] ?? null,
    done: dayStops.filter((s) => s.status === 'done'),
    total: dayStops.length,
    pace: paceLabel(dayStops),
  };
}

type LeftStop = Pick<Stop, 'id' | 'status' | 'left_at'>;

/** The stop left most recently today, up to now (lib/clock time). */
export function lastLeftStop<T extends LeftStop>(dayStops: T[], now: number): T | null {
  let last: T | null = null;
  for (const s of dayStops) {
    if (s.status !== 'done' || !s.left_at || Date.parse(s.left_at) > now) continue;
    if (!last || Date.parse(s.left_at) > Date.parse(last.left_at!)) last = s;
  }
  return last;
}

/**
 * Between stops, the navy block says "Just left [stop]" while something about leaving it is
 * still to answer: the spend check, or an open running-early / running-late card. Once all are
 * answered or dismissed it's null, and the block says "On the way to [next stop]".
 */
export function justLeftStop<T extends LeftStop>(input: {
  dayStops: T[];
  now: number;
  /** The group is at a stop (the normal "Now" block). */
  atStop: boolean;
  /** The stop the spend check asks about, until answered. */
  spendStop: T | null;
  /** An open early card: the stop it says they left (null if it doesn't say). undefined = no card. */
  earlyLeftId?: string | null;
  /** A running-late card is open. */
  late: boolean;
}): T | null {
  const { dayStops, now, atStop, spendStop, earlyLeftId, late } = input;
  if (atStop) return null;
  if (earlyLeftId !== undefined) {
    return dayStops.find((s) => s.id === earlyLeftId) ?? spendStop ?? lastLeftStop(dayStops, now);
  }
  if (spendStop) return spendStop;
  return late ? lastLeftStop(dayStops, now) : null;
}

/** Google Maps directions link to a stop (opens the Maps app; no API call). */
export function directionsUrl(stop: Pick<Stop, 'lat' | 'lng' | 'name' | 'address'>, mode?: TravelMode | null): string {
  const destination =
    stop.lat != null && stop.lng != null ? `${stop.lat},${stop.lng}` : [stop.name, stop.address].filter(Boolean).join(', ');
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  return mode ? `${url}&travelmode=${mode}` : url;
}

export type TravelMode = 'walking' | 'driving';
/** Up to this far (straight line), directions are for walking; further, driving. */
export const WALK_UP_TO_M = 2000;

/** Walking under ~2 km from `from` to the stop, else driving; null when either place is unknown (Maps picks). */
export function travelModeTo(from: LatLng | null, stop: Pick<Stop, 'lat' | 'lng'>): TravelMode | null {
  if (!from || stop.lat == null || stop.lng == null) return null;
  return haversineMeters(from, { lat: stop.lat, lng: stop.lng }) < WALK_UP_TO_M ? 'walking' : 'driving';
}

const WEEKDAYS =['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sunday 12 Oct". */
export function longDate(date: ISODate): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}
