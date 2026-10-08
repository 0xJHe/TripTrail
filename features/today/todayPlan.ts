import { daysBetween, todayISO, type ISODate } from '@/features/planning/dates';
import { dayDate, durationText } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import type { TripStage } from '@/features/trip/types';
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
}

/** Today's Now / Next / Done from the Day plan, or why there is nothing to show. */
export function todayView({ stage, start, days, stops, now }: TodayInput): TodayView {
  const day = tripDayOn(start, now);
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

/** Google Maps directions link to a stop (opens the Maps app; no API call). */
export function directionsUrl(stop: Pick<Stop, 'lat' | 'lng' | 'name' | 'address'>): string {
  const destination =
    stop.lat != null && stop.lng != null ? `${stop.lat},${stop.lng}` : [stop.name, stop.address].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

const WEEKDAYS =['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sunday 12 Oct". */
export function longDate(date: ISODate): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}
