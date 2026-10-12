import { useCallback } from 'react';
import { Linking } from 'react-native';

import type { LatLng } from '@/lib/distance';
import { getGroupLocation, useLocationSource } from '@/lib/location';

/** Where directions go: a position (stop, pin, meet point), else its name + address. */
export interface DirectionsTo {
  lat: number | null;
  lng: number | null;
  name?: string | null;
  address?: string | null;
  /** Google place ID, so Maps shows the place by name. */
  place_id?: string | null;
}

/**
 * Google Maps directions link (the cross-platform Maps URL; opens the Maps app, no API call).
 * No origin = Maps starts from the phone's real location. No travel mode: Maps picks its
 * default and the person can switch between car, motorbike, transit and walking.
 */
export function directionsUrl(to: DirectionsTo, origin?: LatLng | null): string {
  const hasPoint = to.lat != null && to.lng != null;
  const destination = hasPoint ? `${to.lat},${to.lng}` : encodeURIComponent([to.name, to.address].filter(Boolean).join(', '));
  const parts = ['api=1'];
  if (origin) parts.push(`origin=${origin.lat},${origin.lng}`);
  parts.push(`destination=${destination}`);
  if (to.place_id) parts.push(`destination_place_id=${encodeURIComponent(to.place_id)}`);
  return `https://www.google.com/maps/dir/?${parts.join('&')}`;
}

/** Start of the route: Demo mode = the demo group's position (lib/location); real mode = none (the phone's own). */
export async function directionsOrigin(source: 'demo' | 'gps'): Promise<LatLng | null> {
  if (source !== 'demo') return null;
  const loc = await getGroupLocation().catch(() => null);
  return loc ? { lat: loc.center.lat, lng: loc.center.lng } : null;
}

/** Opens Google Maps directions to a stop / pin / meet point. Every Directions button uses this. */
export function useDirections(): (to: DirectionsTo) => Promise<void> {
  const source = useLocationSource();
  return useCallback(
    async (to: DirectionsTo) => {
      const origin = await directionsOrigin(source);
      await Linking.openURL(directionsUrl(to, origin)).catch(() => {});
    },
    [source],
  );
}
