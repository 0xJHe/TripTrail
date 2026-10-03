import type { Href } from 'expo-router';

import type { Trip } from './types';

/** The planning screen a trip should open on. */
export function tripEntryRoute(trip: Pick<Trip, 'id' | 'stage'>): Href {
  if (trip.stage === 'decided') return `/trip/${trip.id}/results`;
  if (trip.stage === 'voting') return `/trip/${trip.id}/options`;
  return `/trip/${trip.id}/preferences`;
}
