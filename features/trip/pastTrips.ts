import type { ISODate } from '@/features/planning/dates';
import type { Trip } from './types';

/** The trip's last day is over (before `today`). Trips without dates are never past. */
export function isPastTrip(trip: Pick<Trip, 'end_date'>, today: ISODate): boolean {
  return !!trip.end_date && trip.end_date < today;
}

/**
 * Home screen sections: current and upcoming trips (in the order given, newest first), then
 * past trips, the one that ended last first.
 */
export function splitTrips<T extends Pick<Trip, 'end_date'>>(trips: T[], today: ISODate): { current: T[]; past: T[] } {
  const current = trips.filter((t) => !isPastTrip(t, today));
  const past = trips
    .filter((t) => isPastTrip(t, today))
    .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''));
  return { current, past };
}

/** "Past trips (3)". */
export function pastTripsLabel(count: number): string {
  return `Past trips (${count})`;
}
