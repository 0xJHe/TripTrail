import { useCallback } from 'react';
import { Alert, Linking } from 'react-native';

import type { LatLng } from '@/lib/distance';
import { getGroupLocation, useLocationSource } from '@/lib/location';

/** Where directions go: a stop (name + address, place ID), or a position (pin, meet point). */
export interface DirectionsTo {
  lat: number | null;
  lng: number | null;
  name?: string | null;
  address?: string | null;
  /** Google place ID, so Maps shows the place by name. */
  place_id?: string | null;
}

/**
 * The destination text: "name, address" when we know the place (an address, or a place ID),
 * so Maps shows it by name; else the coordinates (pins, meet points: Maps URLs can't label a
 * coordinate, it shows as a dropped pin); else whatever name / address there is.
 */
function destinationText(to: DirectionsTo): string {
  const name = to.name?.trim();
  const address = to.address?.trim();
  if (name && (address || to.place_id)) return [name, address].filter(Boolean).join(', ');
  if (to.lat != null && to.lng != null) return `${to.lat},${to.lng}`;
  return [name, address].filter(Boolean).join(', ');
}

/**
 * Google Maps directions link (the cross-platform Maps URL; opens the Maps app, no API call).
 * No origin = Maps starts from the phone's real location. No travel mode: Maps picks its
 * default and the person can switch between car, motorbike, transit and walking.
 */
export function directionsUrl(to: DirectionsTo, origin?: LatLng | null): string {
  const text = destinationText(to);
  const destination = /^-?[\d.]+,-?[\d.]+$/.test(text) ? text : encodeURIComponent(text);
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

export const DEMO_DIRECTIONS_NOTE = 'In Demo mode, the route starts from where the demo group is.';

/**
 * Demo mode only, on every Directions tap: a small popup says the route starts at the demo
 * group (OK, then Maps). Resolves when it's time to open Maps.
 */
export async function demoDirectionsNote(source: 'demo' | 'gps'): Promise<void> {
  if (source !== 'demo') return;
  await new Promise<void>((resolve) => {
    Alert.alert('Directions', DEMO_DIRECTIONS_NOTE, [{ text: 'OK', onPress: () => resolve() }], {
      cancelable: true,
      onDismiss: () => resolve(),
    });
  });
}

/** Opens Google Maps directions to a stop / pin / meet point. Every Directions button uses this. */
export function useDirections(): (to: DirectionsTo) => Promise<void> {
  const source = useLocationSource();
  return useCallback(
    async (to: DirectionsTo) => {
      await demoDirectionsNote(source);
      const origin = await directionsOrigin(source);
      await Linking.openURL(directionsUrl(to, origin)).catch(() => {});
    },
    [source],
  );
}
