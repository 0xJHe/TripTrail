import { todayISO } from '@/features/planning/dates';
import { emptyForm, type StopFormValues } from '@/features/planning/stopForm';
import { durationText } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { haversineMeters, type LatLng } from '@/lib/distance';
import type { Pin, PinType } from './types';

/** Walking speed used for "9 min walk" (same as the demo route). */
const WALK_M_PER_MIN = 80;
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

/** The label over the red pin on the Pin spot map: "📍 Cendol stall" as you type, else "📍 Pin drops here". */
export function dropLabel(type: PinType, typed: string): string {
  return `${type === 'spot' ? '📍' : '🚗'} ${typed.trim() || 'Pin drops here'}`;
}

/** Only the person who pinned it can delete it. */
export function canDeletePin(pin: Pick<Pin, 'member_id'>, myMemberId: string | null | undefined): boolean {
  return !!myMemberId && pin.member_id === myMemberId;
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

/**
 * "Add to plan" opens the normal Add a stop form with this: the pin's name and exact position
 * (food or not from the name, as for any typed stop); the person picks the times.
 */
export function pinForm(pin: Pin, day: number): StopFormValues {
  return { ...emptyForm(day), name: pinTitle(pin), place: { placeId: null, address: null, lat: pin.lat, lng: pin.lng, pinned: true } };
}

/** The Add a stop screen for a pin, on the given day. */
export function pinStopRoute(tripId: string, pinId: string, day: number) {
  return { pathname: '/trip/[id]/stop/[stopId]', params: { id: tripId, stopId: 'new', day: String(day), pin: pinId } } as const;
}

/** A random file name for a pin photo (no crypto needed). */
export function photoPath(tripId: string, memberId: string, now: Date): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${tripId}/${memberId}-${now.getTime()}-${rand}.jpg`;
}
