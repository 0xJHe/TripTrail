import { PIN_PHOTOS } from '@/features/group/api';
import { supabase } from '@/lib/supabase';
import { makeJoinCode } from './joinCode';
import type { Member, Trip, TripFields } from './types';

/** Sign in anonymously with a display name, or rename the current user. */
export async function signInWithName(name: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    const { error } = await supabase.auth.updateUser({ data: { display_name: name } });
    if (error) throw error;
    // Keep the name the group sees in step with the new one.
    await supabase.from('members').update({ display_name: name }).eq('user_id', data.session.user.id);
    return;
  }
  const { error } = await supabase.auth.signInAnonymously({ options: { data: { display_name: name } } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Please sign in first.');
  return id;
}

/** Create the trip with a fresh join code and add the creator as its first member. */
export async function createTrip(fields: TripFields, displayName: string, joinCode?: string): Promise<Trip> {
  const userId = await requireUserId();
  let code = joinCode ?? makeJoinCode(fields.name);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase
      .from('trips')
      .insert({ ...fields, join_code: code, created_by: userId })
      .select()
      .single();
    if (error?.code === '23505') {
      code = makeJoinCode(fields.name); // join code taken, try another
      continue;
    }
    if (error) throw error;
    const trip = data as Trip;
    const { error: memberError } = await supabase
      .from('members')
      .insert({ trip_id: trip.id, user_id: userId, display_name: displayName });
    if (memberError) throw memberError;
    return trip;
  }
  throw new Error('Could not make a join code. Please try again.');
}

export async function updateTrip(id: string, patch: Partial<Trip>): Promise<void> {
  const { error } = await supabase.from('trips').update(patch).eq('id', id);
  if (error) throw error;
}

/** Join by code. Returns the trip id. */
export async function joinTrip(code: string, displayName: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_trip', { code, name: displayName, color: '' });
  if (error) {
    if (/invalid join code/i.test(error.message)) throw new Error('No trip with that code. Check it and try again.');
    throw error;
  }
  return data as string;
}

export async function fetchTrip(id: string): Promise<Trip> {
  const { data, error } = await supabase.from('trips').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Trip;
}

async function fetchAllMembers(tripId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('trip_id', tripId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Member[];
}

/**
 * The trip's real members, in join order. A demo trip's made-up members (is_demo) are left
 * out, so every count (Done for today, spend checks, the map, the organiser) is real people only.
 */
export async function fetchMembers(tripId: string): Promise<Member[]> {
  return (await fetchAllMembers(tripId)).filter((m) => !m.is_demo);
}

/** A demo trip's made-up members ("Aisha (demo)"), in join order. */
export async function fetchMadeUpMembers(tripId: string): Promise<Member[]> {
  return (await fetchAllMembers(tripId)).filter((m) => m.is_demo);
}

/** Trips I'm a member of, newest first. */
export async function fetchMyTrips(userId: string): Promise<Trip[]> {
  const { data, error } = await supabase.from('members').select('trips(*)').eq('user_id', userId);
  if (error) throw error;
  const trips = ((data ?? []) as unknown as { trips: Trip | null }[])
    .map((row) => row.trips)
    .filter((t): t is Trip => !!t);
  return trips.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** What leaving did: 'deleted' when I was the last member (the trip went with me). */
export type LeaveResult = 'left' | 'deleted';

/**
 * Leave a trip (Group tab). Pin photos go first, while I'm still a member (storage can't be
 * cleaned up from SQL): mine, or every photo in the trip's folder when I'm the last member.
 * Then leave_trip removes my member row, passes the organiser role on, or deletes the trip.
 */
export async function leaveTrip(tripId: string, memberId: string, lastMember: boolean): Promise<LeaveResult> {
  await removePinPhotos(tripId, lastMember ? null : memberId);
  const { data, error } = await supabase.rpc('leave_trip', { p_trip: tripId });
  if (error) throw error;
  return data === 'deleted' ? 'deleted' : 'left';
}

/** Pin photos are "<trip id>/<member id>-<time>-<random>.jpg" (features/group/pins.ts photoPath). */
async function removePinPhotos(tripId: string, memberId: string | null): Promise<void> {
  const bucket = supabase.storage.from(PIN_PHOTOS);
  const { data, error } = await bucket.list(tripId, { limit: 1000, ...(memberId ? { search: `${memberId}-` } : {}) });
  if (error) throw error;
  const paths = (data ?? [])
    .filter((f) => !memberId || f.name.startsWith(`${memberId}-`))
    .map((f) => `${tripId}/${f.name}`);
  if (paths.length === 0) return;
  const removed = await bucket.remove(paths);
  if (removed.error) throw removed.error;
}
