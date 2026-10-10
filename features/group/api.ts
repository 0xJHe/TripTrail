import { supabase } from '@/lib/supabase';
import type { LocationRow, NewPin, Pin, PinWithPhoto } from './types';

export const PIN_PHOTOS = 'pin-photos';
/** Photo links last this long (seconds); the list is refetched well before. */
const LINK_SECONDS = 60 * 60;

/** The trip's pins, each with a short-lived link to its photo. */
export async function fetchPins(tripId: string): Promise<PinWithPhoto[]> {
  const { data, error } = await supabase.from('pins').select('*').eq('trip_id', tripId);
  if (error) throw error;
  const pins = (data ?? []) as Pin[];
  const paths = pins.map((p) => p.photo_url).filter((p): p is string => !!p);
  const links = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from(PIN_PHOTOS).createSignedUrls(paths, LINK_SECONDS);
    for (const s of signed ?? []) if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
  }
  return pins.map((p) => ({ ...p, photoLink: p.photo_url ? links.get(p.photo_url) ?? null : null }));
}

/** Upload a photo (a local file uri from the camera / library) to the trip's folder. */
export async function uploadPinPhoto(path: string, uri: string): Promise<void> {
  const body = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage.from(PIN_PHOTOS).upload(path, body, { contentType: 'image/jpeg' });
  if (error) throw error;
}

/** Save a pin; everyone in the trip sees it through Realtime on `pins`. */
export async function addPin(tripId: string, memberId: string, pin: NewPin): Promise<void> {
  const { error } = await supabase.from('pins').insert({ ...pin, trip_id: tripId, member_id: memberId });
  if (error) throw error;
}

/** Save this phone's position + battery; everyone in the trip gets it through Realtime on `locations`. */
export async function saveLocation(row: LocationRow): Promise<void> {
  const { error } = await supabase.from('locations').insert(row);
  if (error) throw error;
}

const LOCATION_COLUMNS = 'member_id, trip_id, lat, lng, battery, recorded_at';

/** Each member's newest position since `since` (one small query per member, so a quiet phone isn't missed). */
export async function fetchLatestLocations(tripId: string, memberIds: string[], since: string): Promise<LocationRow[]> {
  const rows = await Promise.all(
    memberIds.map(async (memberId) => {
      const { data, error } = await supabase
        .from('locations')
        .select(LOCATION_COLUMNS)
        .eq('trip_id', tripId)
        .eq('member_id', memberId)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as LocationRow | undefined) ?? null;
    }),
  );
  return rows.filter((r): r is LocationRow => r != null);
}
