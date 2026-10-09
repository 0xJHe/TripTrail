import type { NewStop } from '@/features/planning/types';
import { supabase } from '@/lib/supabase';
import type { CheckKind, EtaReply } from '@/supabase/functions/_shared/eta';
import type { NearbyReply, RainReply } from '@/supabase/functions/_shared/nearby';
import type { WeatherReply } from '@/supabase/functions/_shared/weather';
import type {
  EarlyAlert,
  LateAlert,
  NewEarlyAlert,
  NewLateAlert,
  NewRainAlert,
  RainAlert,
  StopTimes,
  VisitChange,
} from './types';

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

export async function fetchRainAlerts(tripId: string): Promise<RainAlert[]> {
  const { data, error } = await supabase.from('rain_alerts').select('*').eq('trip_id', tripId);
  if (error) throw error;
  return (data ?? []) as RainAlert[];
}

/** Save the rain card for an outdoor stop. If another phone already did, theirs stays (one card per stop). */
export async function raiseRainAlert(alert: NewRainAlert): Promise<void> {
  const { error } = await supabase.from('rain_alerts').upsert(alert, { onConflict: 'stop_id', ignoreDuplicates: true });
  if (error) throw error;
}

export interface RainAsk {
  /** The outdoor stop. */
  stopId: string;
  from: { lat: number; lng: number };
  /** Minutes since midnight when the new place would start (the fake time in Demo mode). */
  localMinutes: number;
}

/** Up to 3 indoor places for an outdoor stop (nearby-suggestion Edge Function, kind 'rain'). */
export async function fetchRainOptions(tripId: string, ask: RainAsk): Promise<RainReply> {
  const { data, error } = await supabase.functions.invoke<RainReply>('nearby-suggestion', {
    body: { tripId, kind: 'rain', ...ask },
  });
  if (error) throw error;
  return data ?? { options: [], limited: false, placesCalls: 0 };
}

/**
 * Answer the rain card for the whole group (decide_rain): 'go' swaps the place in for the
 * outdoor stop, 'keep' keeps the plan. False if someone already did.
 */
export async function decideRain(
  stopId: string,
  choice: 'go' | 'keep',
  go: { placeId: string; now: string; start: string | null; end: string | null } | null = null,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('decide_rain', {
    p_stop: stopId,
    p_choice: choice,
    p_place: go?.placeId ?? null,
    p_now: go?.now ?? null,
    p_start: go?.start ?? null,
    p_end: go?.end ?? null,
  });
  if (error) throw error;
  return data === true;
}

/**
 * Demo mode Reset: forget the rain, running-early and running-late cards checked after
 * `after`, putting back the stops they changed. Latest kind first: in a demo day rain comes
 * after early, early after late, so the oldest saved times are put back last.
 */
export async function undoDemoMoments(tripId: string, after: Date): Promise<void> {
  const rain = await supabase.rpc('undo_rain_alerts', { p_trip: tripId, p_after: after.toISOString() });
  if (rain.error) throw rain.error;
  const early = await supabase.rpc('undo_early_alerts', { p_trip: tripId, p_after: after.toISOString() });
  if (early.error) throw early.error;
  const late = await supabase.rpc('undo_late_alerts', { p_trip: tripId, p_after: after.toISOString() });
  if (late.error) throw late.error;
}
