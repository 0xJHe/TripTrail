import { PIN_PHOTOS } from '@/features/group/api';
import type { DemoSession } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import { sessionFromRow, type DemoSessionRow } from './session';

/**
 * The trip's shared demo (`demo_sessions`). Members read it; it only changes through the
 * demo_* functions, which apply a tap only if it saw the latest `step` (two taps at once =
 * one step). Each returns the state after the call, applied or not.
 */

interface DemoReply {
  applied: boolean;
  session: DemoSessionRow | null;
  photos?: string[];
}

export async function fetchDemoSession(tripId: string): Promise<DemoSession> {
  const { data, error } = await supabase.from('demo_sessions').select('*').eq('trip_id', tripId).maybeSingle();
  if (error) throw error;
  return sessionFromRow(data as DemoSessionRow | null);
}

async function call(fn: string, args: Record<string, unknown>): Promise<DemoReply> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as DemoReply;
}

/** Turn Demo mode on or off for everyone in the trip. */
export async function setDemoEnabled(tripId: string, on: boolean): Promise<DemoSession> {
  return sessionFromRow((await call('demo_set_enabled', { p_trip: tripId, p_on: on })).session);
}

/** Start the shared clock at Day 1's replay start (only if no phone has yet). */
export async function initDemo(tripId: string, start: number, day: number): Promise<DemoSession> {
  const reply = await call('demo_init', { p_trip: tripId, p_start: new Date(start).toISOString(), p_day: day });
  return sessionFromRow(reply.session);
}

/** +15 min / Next event / Next day, if `step` is still the latest. */
export async function stepDemo(
  tripId: string,
  step: number,
  move: { fakeTime: number; day: number | null; eventAt: number | null },
): Promise<DemoSession> {
  const reply = await call('demo_step', {
    p_trip: tripId,
    p_step: step,
    p_fake_time: new Date(move.fakeTime).toISOString(),
    p_day: move.day,
    p_event_at: move.eventAt == null ? null : new Date(move.eventAt).toISOString(),
  });
  return sessionFromRow(reply.session);
}

/** Reset for the whole trip (if `step` is still the latest); the removed pins' photo paths. */
export async function resetDemo(
  tripId: string,
  step: number,
  start: number | null,
): Promise<{ session: DemoSession; applied: boolean; photos: string[] }> {
  const reply = await call('demo_reset', {
    p_trip: tripId,
    p_step: step,
    p_start: start == null ? null : new Date(start).toISOString(),
  });
  return { session: sessionFromRow(reply.session), applied: reply.applied, photos: reply.photos ?? [] };
}

/** Photos of pins Reset removed (anyone in the trip may delete a photo no pin uses). */
export async function removePinPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(PIN_PHOTOS).remove(paths);
  if (error) throw error;
}

/** Demo mode: this phone's real battery, for the group (never a position). */
export async function saveDemoBattery(tripId: string, memberId: string, battery: number): Promise<void> {
  const { error } = await supabase
    .from('demo_batteries')
    .upsert({ trip_id: tripId, member_id: memberId, battery, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Each real member's battery in Demo mode (member id -> %). */
export async function fetchDemoBatteries(tripId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('demo_batteries').select('member_id, battery').eq('trip_id', tripId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r: { member_id: string; battery: number }) => [r.member_id, r.battery]));
}

/** What "Try a demo trip" did: made a fresh private copy, or found the person's unfinished one. */
export interface DemoTripReply {
  tripId: string;
  created: boolean;
}

/**
 * Try a demo trip (Settings): a fresh private copy of the hidden Penang template for this person
 * only, with its full Day plan and its made-up member, or their unfinished copy if they have one.
 */
export async function startDemoTrip(displayName: string): Promise<DemoTripReply> {
  const { data, error } = await supabase.rpc('start_demo_trip', { p_name: displayName });
  if (error) throw error;
  const reply = data as { trip_id: string; created: boolean };
  return { tripId: reply.trip_id, created: reply.created };
}
