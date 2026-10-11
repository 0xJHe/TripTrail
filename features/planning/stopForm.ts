import type { ISODate } from './dates';
import { atClock, clockOf, dayDate, parseClock } from './stops';
import type { NewStop, Stop } from './types';

/** Place = anything the group does; flight and hotel are booked by hand. */
export type StopKind = 'place' | 'flight' | 'hotel';

/** Where the stop is: picked from the Google search, or from the AI plan. */
export interface FormPlace {
  placeId: string | null;
  address: string | null;
  lat: number;
  lng: number;
}

export interface StopFormValues {
  kind: StopKind;
  day: number;
  name: string;
  time: string;
  endTime: string;
  price: string;
  /** Price is a guess, shown with "~". */
  estimate: boolean;
  /** Null = no location (typed by hand). */
  place: FormPlace | null;
}

export function formFromStop(stop: Stop): StopFormValues {
  const kind: StopKind = stop.category === 'flight' || stop.category === 'hotel' ? stop.category : 'place';
  return {
    kind,
    day: stop.day_number,
    name: stop.name,
    time: clockOf(stop.planned_time),
    endTime: clockOf(stop.planned_end),
    price: String(stop.price ?? 0),
    estimate: stop.is_estimate,
    place:
      stop.lat != null && stop.lng != null
        ? { placeId: stop.place_id, address: stop.address, lat: stop.lat, lng: stop.lng }
        : null,
  };
}

export function emptyForm(day: number): StopFormValues {
  return { kind: 'place', day, name: '', time: '', endTime: '', price: '', estimate: false, place: null };
}

export type StopFields = Omit<NewStop, 'position' | 'tip' | 'is_outdoor'>;

export const PICK_TIMES = 'Please pick a start and end time';
export const END_BEFORE_START = 'End time must be after the start time';

type Times = Pick<StopFormValues, 'time' | 'endTime'>;

/**
 * What's wrong with the times when Add stop / Save is tapped (shown under the times, nothing
 * saved): one missing, or the end not after the start. Null when they're fine.
 */
export function timeProblem(form: Times): string | null {
  const time = form.time.trim();
  const end = form.endTime.trim();
  if (!time || !end) return PICK_TIMES;
  const a = parseClock(time);
  const b = parseClock(end);
  return a != null && b != null && b <= a ? END_BEFORE_START : null;
}

/** A finished time, "9:30" / "09.30" / "0930", not one still being typed ("1", "10:4"). */
const COMPLETE_CLOCK = /^(\d{1,2}[:.]\d{2}|\d{4})$/;

/**
 * End not after start, once both times are in: the red line under the times shows straight
 * away (picked times are always whole; typed ones only once finished, so "1" on the way to
 * "10:45" doesn't flash it).
 */
export function endNotAfterStart(form: Times): boolean {
  const time = form.time.trim();
  const end = form.endTime.trim();
  if (!COMPLETE_CLOCK.test(time) || !COMPLETE_CLOCK.test(end)) return false;
  const a = parseClock(time);
  const b = parseClock(end);
  return a != null && b != null && b <= a;
}

/** Check the form and turn it into stop fields, or say what's wrong in plain words. */
export function readStopForm(
  form: StopFormValues,
  start: ISODate,
  oldCategory: Stop['category'] = null,
): { ok: true; fields: StopFields } | { ok: false; error: string } {
  const name = form.name.trim();
  if (!name) return { ok: false, error: 'Give the stop a name.' };
  const date = dayDate(start, form.day);
  const time = form.time.trim();
  const end = form.endTime.trim();
  if (!time || !end) return { ok: false, error: PICK_TIMES };
  const planned = atClock(date, time);
  if (!planned) return { ok: false, error: 'Time should look like 09:30.' };
  const plannedEnd = atClock(date, end);
  if (!plannedEnd) return { ok: false, error: 'End time should look like 10:45.' };
  if (plannedEnd <= planned) return { ok: false, error: END_BEFORE_START };
  const priceText = form.price.replace(/rm/i, '').replace(/[~,\s]/g, '');
  const price = priceText ? Number(priceText) : 0;
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'Price should be a number, like 16.' };

  const booked = form.kind !== 'place';
  const keepCategory = oldCategory && oldCategory !== 'flight' && oldCategory !== 'hotel' ? oldCategory : 'sight';
  const place = form.place;
  return {
    ok: true,
    fields: {
      day_number: form.day,
      name,
      planned_time: planned,
      planned_end: plannedEnd,
      price,
      is_estimate: !booked && form.estimate,
      is_booked: booked,
      category: booked ? (form.kind as 'flight' | 'hotel') : keepCategory,
      address: place?.address ?? null,
      lat: place?.lat ?? null,
      lng: place?.lng ?? null,
      place_id: place?.placeId ?? null,
    },
  };
}
