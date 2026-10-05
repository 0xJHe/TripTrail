import { supabase } from '@/lib/supabase';
import type { WeatherReply } from '@/supabase/functions/_shared/weather';
import type { VisitChange } from './types';

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
