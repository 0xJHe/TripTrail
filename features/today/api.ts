import { supabase } from '@/lib/supabase';
import type { VisitChange } from './types';

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
