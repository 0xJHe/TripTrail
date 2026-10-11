import { supabase } from '@/lib/supabase';
import type { LocationRow, MeetPointRow, NewMeetPoint, NewPin, Pin, PinWithPhoto } from './types';

export const PIN_PHOTOS = 'pin-photos';
/** Photo links last this long (seconds); the list is refetched well before. */
const LINK_SECONDS = 60 * 60;

/** The trip's pins, each with a short-lived link to its photo. */
export async function fetchPins(tripId: string): Promise<PinWithPhoto[]> {
  const { data, error } = await supabase.from('pins').select('*').eq('trip_id', tripId).is('deleted_at', null);
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

/**
 * Delete one of my pins and its photo. The photo goes first (so a failed delete can be tried
 * again); then the row is marked deleted, which Realtime (filtered by trip_id) sends to
 * everyone, and then removed. A stop made from it with Add to plan stays in the plan.
 */
export async function deletePin(pin: Pick<Pin, 'id' | 'photo_url'>, at: string): Promise<void> {
  if (pin.photo_url) {
    const { data, error } = await supabase.storage.from(PIN_PHOTOS).remove([pin.photo_url]);
    if (error) throw error;
    if (!data?.length) {
      // Nothing removed: either it's already gone (a retry) or storage didn't allow it.
      const still = await supabase.storage.from(PIN_PHOTOS).createSignedUrl(pin.photo_url, 10);
      if (!still.error) throw new Error("Couldn't delete the photo. Only the person who pinned it can delete it.");
    }
  }
  const { data, error } = await supabase.from('pins').update({ deleted_at: at }).eq('id', pin.id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Only the person who pinned it can delete it.');
  const gone = await supabase.from('pins').delete().eq('id', pin.id);
  if (gone.error) throw gone.error;
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

/** The trip's latest meet points and splits (the current ones are picked by meetPoint.ts). */
export async function fetchMeetPoints(tripId: string): Promise<MeetPointRow[]> {
  const { data, error } = await supabase
    .from('meet_points')
    .select('*')
    .eq('trip_id', tripId)
    .order('set_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return ((data ?? []) as MeetPointRow[]).map((r) => ({ ...r, group_b: r.group_b ?? [] }));
}

/** Set a meet point or start a split; everyone sees it through Realtime on `meet_points`. */
export async function addMeetPoint(tripId: string, memberId: string | null, row: NewMeetPoint): Promise<void> {
  const { error } = await supabase
    .from('meet_points')
    .insert({ ...row, trip_id: tripId, set_by: memberId, status: 'active', active: true });
  if (error) throw error;
}

/** End a meet point / split: 'together' when everyone got there, 'cleared' by hand. `at` = now(). */
export async function endMeetPoint(id: string, status: 'together' | 'cleared', at: string, by: string | null): Promise<void> {
  const { error } = await supabase
    .from('meet_points')
    .update({ status, active: false, ended_at: at, ended_by: by })
    .eq('id', id);
  if (error) throw error;
}

/** Who has answered preferences (member ids only: the answers themselves stay private to planning). */
export async function fetchAnsweredIds(tripId: string): Promise<string[]> {
  const { data, error } = await supabase.from('preferences').select('member_id').eq('trip_id', tripId);
  if (error) throw error;
  return ((data ?? []) as { member_id: string }[]).map((r) => r.member_id);
}
