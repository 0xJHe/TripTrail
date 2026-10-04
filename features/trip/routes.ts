import type { Href } from 'expo-router';

import type { Trip } from './types';

/** The screen a trip should open on: its Day plan once built, else the planning step it's at. */
export function tripEntryRoute(trip: Pick<Trip, 'id' | 'stage'>): Href {
  if (trip.stage === 'decided') return '/plan'; // set it as the current trip first
  if (trip.stage === 'voting') return `/trip/${trip.id}/options`;
  return `/trip/${trip.id}/preferences`;
}
