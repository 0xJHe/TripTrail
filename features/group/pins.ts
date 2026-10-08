import { todayISO } from '@/features/planning/dates';
import { durationText } from '@/features/planning/stops';
import type { NewStop, Stop } from '@/features/planning/types';
import { haversineMeters, type LatLng } from '@/lib/distance';
import type { Pin, PinType } from './types';

const MIN = 60_000;
/** Walking speed used for "9 min walk" (same as the demo route). */
const WALK_M_PER_MIN = 80;
/** A pin added to the plan gets this long. */
const PIN_STOP_MINUTES = 30;
/** Same place as a stop if this close (a pin added to the plan keeps its exact position). */
const SAME_PLACE_M = 5;

export const DEFAULT_PIN_NAME: Record<PinType, string> = { spot: 'Pinned spot', vehicle: 'Car' };

/** What to save as the pin's name: the typed name, or "Pinned spot" / "Car". */
export function pinName(type: PinType, typed: string): string {
  return typed.trim().slice(0, 80) || DEFAULT_PIN_NAME[type];
}

/** "Line Clear nasi kandar", "Car · Komtar car park L3". */
export function pinTitle(pin: Pick<Pin, 'type' | 'name'>): string {
  const name = pin.name?.trim() || DEFAULT_PIN_NAME[pin.type];
  if (pin.type === 'spot' || name === DEFAULT_PIN_NAME.vehicle) return name;
  return `Car · ${name}`;
}

/** "400 m away" for a spot, "9 min walk" for a vehicle; null without a position. */
export function pinDistance(pin: Pin, me: LatLng | null): string | null {
  if (!me) return null;
  const m = haversineMeters(me, pin);
  if (pin.type === 'vehicle') return m < 40 ? 'right here' : `${durationText(Math.max(1, Math.round(m / WALK_M_PER_MIN)))} walk`;
  if (m < 40) return 'right here';
  return m < 1000 ? `${Math.round(m / 10) * 10} m away` : `${(m / 1000).toFixed(1)} km away`;
}

/** Pins made today (by the phone's calendar, at `now`), newest first. */
export function pinsToday<T extends Pick<Pin, 'created_at'>>(pins: T[], now: Date): T[] {
  const today = todayISO(now);
  return pins
    .filter((p) => todayISO(new Date(p.created_at)) === today)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** Is this pin already a stop on the day? */
export function pinInPlan(pin: Pin, dayStops: Pick<Stop, 'name' | 'lat' | 'lng' | 'status'>[]): boolean {
  return dayStops.some(
    (s) =>
      s.status !== 'dropped' &&
      s.lat != null &&
      s.lng != null &&
      s.name === pinTitle(pin) &&
      haversineMeters(s as LatLng, pin) <= SAME_PLACE_M,
  );
}

/** The stop "Add to plan" makes: today, starting at the next quarter hour, 30 min, free. */
export function pinToStop(pin: Pin, day: number, position: number, now: Date): NewStop {
  const quarter = 15 * MIN;
  const start = Math.ceil(now.getTime() / quarter) * quarter;
  return {
    day_number: day,
    position,
    name: pinTitle(pin),
    lat: pin.lat,
    lng: pin.lng,
    planned_time: new Date(start).toISOString(),
    planned_end: new Date(start + PIN_STOP_MINUTES * MIN).toISOString(),
    price: 0,
    is_estimate: true,
    is_booked: false,
    is_outdoor: false,
    tip: null,
    category: 'sight',
    address: null,
    place_id: null,
  };
}

/** A random file name for a pin photo (no crypto needed). */
export function photoPath(tripId: string, memberId: string, now: Date): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${tripId}/${memberId}-${now.getTime()}-${rand}.jpg`;
}
