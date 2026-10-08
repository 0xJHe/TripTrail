import type { NewStop } from '@/features/planning/types';
import { supabase } from '@/lib/supabase';
import type { CheckKind, EtaReply } from '@/supabase/functions/_shared/eta';
import type { NearbyReply } from '@/supabase/functions/_shared/nearby';
import type { WeatherReply } from '@/supabase/functions/_shared/weather';
import type { EarlyAlert, LateAlert, NewEarlyAlert, NewLateAlert, StopTimes, VisitChange } from './types';

export interface WeatherRequest {
  /** Where the group is (current weather). */
  now: { lat: number; lng: number } | null;
  /** The next stop, and how many minutes until it starts (its forecast). */
  next: { lat: number; lng: number; inMinutes: number } | null;
}

/** Weather from the weather Edge Function (cached per ~1 km for 30 min, 30 calls per trip per day). */
export async function fetchWeather(tripId: string, req: WeatherRequest): Promise<WeatherReply> {
  const { data, error } = await supabase.functions.invoke<WeatherReply>('weather', { body: { tripId, ...req } });
  if (error) throw error;
  return data ?? { now: null, next: null, limited: false, weatherCalls: 0 };
}

/**
 * Save a stop's arrived / left times. Only applies if the stop still has the status the
 * change started from, so when every phone in the group sees the arrival, it's saved once.
 * Everyone's Today tab updates through Realtime on `stops`.
 */
export async function saveVisit(change: VisitChange): Promise<void> {
  const { error } = await supabase
    .from('stops')
    .update({ status: change.status, arrived_at: change.arrived_at, left_at: change.left_at })
    .eq('id', change.stopId)
    .eq('status', change.from);
  if (error) throw error;
}

export async function fetchLateAlerts(tripId: string): Promise<LateAlert[]> {
  const { data, error } = await supabase.from('late_alerts').select('*').eq('trip_id', tripId);
  if (error) throw error;
  return (data ?? []) as LateAlert[];
}

/** Save the running-late card for a stop. If another phone already did, theirs stays (one card per stop). */
export async function raiseLateAlert(alert: NewLateAlert): Promise<void> {
  const { error } = await supabase.from('late_alerts').upsert(alert, { onConflict: 'stop_id', ignoreDuplicates: true });
  if (error) throw error;
}

/** Real travel time from Google (eta Edge Function); null = keep the free estimate. */
export async function fetchEta(
  tripId: string,
  stopId: string,
  kind: CheckKind,
  from: { lat: number; lng: number },
): Promise<EtaReply> {
  const { data, error } = await supabase.functions.invoke<EtaReply>('eta', { body: { tripId, stopId, kind, from } });
  if (error) throw error;
  return data ?? { minutes: null, source: null, limited: false, routesCalls: 0 };
}

/** Accept the suggested new day ('rules') or keep the original. False if someone else already decided. */
export async function decideNewDay(stopId: string, choice: 'rules' | 'keep'): Promise<boolean> {
  const { data, error } = await supabase.rpc('decide_new_day', { p_stop: stopId, p_choice: choice });
  if (error) throw error;
  return data === true;
}

export async function fetchEarlyAlerts(tripId: string): Promise<EarlyAlert[]> {
  const { data, error } = await supabase.from('early_alerts').select('*').eq('trip_id', tripId);
  if (error) throw error;
  return (data ?? []) as EarlyAlert[];
}

/** Save the running-early card for a stop. If another phone already did, theirs stays (one card per stop). */
export async function raiseEarlyAlert(alert: NewEarlyAlert): Promise<void> {
  const { error } = await supabase.from('early_alerts').upsert(alert, { onConflict: 'stop_id', ignoreDuplicates: true });
  if (error) throw error;
}

export interface NearbyAsk {
  stopId: string;
  from: { lat: number; lng: number };
  spareMin: number;
  /** Minutes since midnight on the phone's clock (the fake time in Demo mode). */
  localMinutes: number;
}

/** One nearby place to fill the spare time (nearby-suggestion Edge Function); null = none fits. */
export async function fetchNearby(tripId: string, ask: NearbyAsk): Promise<NearbyReply> {
  const { data, error } = await supabase.functions.invoke<NearbyReply>('nearby-suggestion', { body: { tripId, ...ask } });
  if (error) throw error;
  return data ?? { suggestion: null, limited: false, placesCalls: 0 };
}

/** Answer the running-early card for the whole group (decide_early). False if someone already did. */
export async function decideEarly(
  stopId: string,
  choice: 'offer' | 'add' | 'move' | 'keep',
  extra: { add?: NewStop; times?: StopTimes[] } = {},
): Promise<boolean> {
  const { data, error } = await supabase.rpc('decide_early', {
    p_stop: stopId,
    p_choice: choice,
    p_add: extra.add ?? null,
    p_times: extra.times ?? null,
  });
  if (error) throw error;
  return data === true;
}

/**
 * Demo mode Reset: forget the running-early and running-late cards checked after `after`,
 * putting back the stop times they changed. Early first: in a demo day it comes after late,
 * so the late card's saved times are the older ones and must be put back last.
 */
export async function undoDemoMoments(tripId: string, after: Date): Promise<void> {
  const early = await supabase.rpc('undo_early_alerts', { p_trip: tripId, p_after: after.toISOString() });
  if (early.error) throw early.error;
  const late = await supabase.rpc('undo_late_alerts', { p_trip: tripId, p_after: after.toISOString() });
  if (late.error) throw late.error;
}
