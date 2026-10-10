import { supabase } from '@/lib/supabase';
import type { DayClosure } from './types';

/** Everyone's "Done for today" rows for the trip. */
export async function fetchDayClosures(tripId: string): Promise<DayClosure[]> {
  const { data, error } = await supabase.from('day_closures').select('*').eq('trip_id', tripId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, closed: r.closed !== false }) as DayClosure);
}

/**
 * Close (or reopen) this person's day. One row per person per day; reopening keeps the row
 * with closed = false (an update, which Realtime sends to everyone filtered by trip_id).
 */
export async function saveDayClosure(row: DayClosure): Promise<void> {
  const { error } = await supabase.from('day_closures').upsert(row, { onConflict: 'member_id,day_number' });
  if (error) throw error;
}
