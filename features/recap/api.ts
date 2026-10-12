import { supabase } from '@/lib/supabase';
import type { Fix } from './trail';
import type { DayClosure } from './types';

/** Everyone's "Done for today" rows for the trip. */
export async function fetchDayClosures(tripId: string): Promise<DayClosure[]> {
  const { data, error } = await supabase.from('day_closures').select('*').eq('trip_id', tripId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, closed: r.closed !== false }) as DayClosure);
}

/**
 * Close this person's day (Done for today, final). One row per person per day; closing again
 * after a Demo mode Reset updates the row (Realtime sends it to everyone filtered by trip_id).
 */
export async function saveDayClosure(row: DayClosure): Promise<void> {
  const { error } = await supabase.from('day_closures').upsert(row, { onConflict: 'member_id,day_number' });
  if (error) throw error;
}

const PAGE = 1000;
/** A long day at one row every ~45 s is about 1,500 rows; stop well past that. */
const MAX_ROWS = 6000;

/** This person's saved positions between two times (oldest first), for the day recap trail. */
export async function fetchMyPositions(tripId: string, memberId: string, from: string, to: string): Promise<Fix[]> {
  const out: Fix[] = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE) {
    const { data, error } = await supabase
      .from('locations')
      .select('lat, lng, recorded_at')
      .eq('trip_id', tripId)
      .eq('member_id', memberId)
      .gte('recorded_at', from)
      .lte('recorded_at', to)
      .order('recorded_at', { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) out.push({ lat: r.lat, lng: r.lng, at: Date.parse(r.recorded_at) });
    if ((data?.length ?? 0) < PAGE) break;
  }
  return out;
}
