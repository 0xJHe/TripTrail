import type { StopDraft } from '@/lib/ai';
import { formatMoney } from '@/lib/theme';
import { addDays, todayISO, type ISODate } from './dates';
import type { NewStop, Stop } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** "9:30", "09:30", "19.00", "930" -> minutes after midnight; null if it isn't a time. */
export function parseClock(text: string): number | null {
  const t = text.trim();
  const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(t) ?? /^(\d{1,2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes after midnight -> "09:30". */
export function clockText(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Phone-local timestamp for a date and "HH:MM". Stops are planned in the phone's time zone. */
export function atClock(date: ISODate, clock: string): string | null {
  const minutes = parseClock(clock);
  if (minutes == null) return null;
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60).toISOString();
}

/** ISO timestamp -> "09:30" on the phone's clock. */
export function clockOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "06:50 – 07:50", "08:30", or "" when there's no time. */
export function timeLabel(stop: Pick<Stop, 'planned_time' | 'planned_end'>): string {
  const start = clockOf(stop.planned_time);
  const end = clockOf(stop.planned_end);
  return start && end ? `${start} – ${end}` : start;
}

/** "~RM 16", "RM 15". */
export function priceLabel(stop: Pick<Stop, 'price' | 'is_estimate'>): string {
  return formatMoney(stop.price, stop.is_estimate);
}

/** Calendar date of a trip day (day 1 = start). */
export function dayDate(start: ISODate, day: number): ISODate {
  return addDays(start, day - 1);
}

/** First day of the plan: the trip's start date, else the earliest stop's date, else tomorrow. */
export function planStart(tripStart: ISODate | null, stops: Pick<Stop, 'day_number' | 'planned_time'>[], now = new Date()): ISODate {
  if (tripStart) return tripStart;
  const timed = stops.filter((s) => s.planned_time).sort((a, b) => a.day_number - b.day_number)[0];
  if (timed) return addDays(todayISO(new Date(timed.planned_time!)), 1 - timed.day_number);
  return addDays(todayISO(now), 1);
}

/** Turn AI / sample drafts into rows to save, with real timestamps from the trip's start date. */
export function draftsToStops(drafts: StopDraft[], start: ISODate): NewStop[] {
  const positions = new Map<number, number>();
  return drafts.map((d) => {
    const position = positions.get(d.day) ?? 0;
    positions.set(d.day, position + 1);
    const date = dayDate(start, d.day);
    return {
      day_number: d.day,
      position,
      name: d.name,
      lat: d.lat,
      lng: d.lng,
      planned_time: atClock(date, d.time),
      planned_end: d.endTime ? atClock(date, d.endTime) : null,
      price: d.price,
      is_estimate: d.isEstimate,
      is_booked: d.category === 'flight' || d.category === 'hotel',
      is_outdoor: d.isOutdoor,
      tip: d.tip,
      category: d.category,
      address: d.address ?? null,
      place_id: d.placeId ?? null,
    };
  });
}

/** Stops still in the plan, in order: day, then time (untimed last), then position. */
export function sortStops<T extends Pick<Stop, 'day_number' | 'planned_time' | 'position' | 'status'>>(stops: T[]): T[] {
  return stops
    .filter((s) => s.status !== 'dropped')
    .sort((a, b) => a.day_number - b.day_number || timeValue(a) - timeValue(b) || a.position - b.position);
}

const timeValue = (s: Pick<Stop, 'planned_time'>) => (s.planned_time ? Date.parse(s.planned_time) : Infinity);

/** Number of day tabs: the trip length, or more if stops were added to a later day. */
export function dayCount(stops: Pick<Stop, 'day_number'>[], tripDays: number | null): number {
  return Math.max(1, tripDays ?? 0, ...stops.map((s) => s.day_number));
}
