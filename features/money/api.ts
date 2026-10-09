import { supabase } from '@/lib/supabase';
import type { NewSpend, Spend } from './types';

/** Everyone's spend-check answers and extra spends for the trip. */
export async function fetchSpends(tripId: string): Promise<Spend[]> {
  const { data, error } = await supabase.from('spends').select('*').eq('trip_id', tripId);
  if (error) throw error;
  return (data ?? []).map((s) => ({ ...s, amount: Number(s.amount) || 0 }) as Spend);
}

/**
 * Save this person's spend-check answer for a stop. One per person per stop per day: the
 * prompt only asks once, so a second save only happens after Demo mode Reset, and replaces the old one.
 */
export async function saveSpend(spend: NewSpend): Promise<void> {
  const { error } = await supabase.from('spends').upsert(spend, { onConflict: 'stop_id,member_id,day_number' });
  if (error) throw error;
}

/** Log an extra spend ("+ Add spend" on the Plan tab). */
export async function addExtraSpend(spend: NewSpend): Promise<void> {
  const { error } = await supabase.from('spends').insert(spend);
  if (error) throw error;
}

/** Delete one of this person's extra spends (RLS: only their own). */
export async function deleteSpend(id: string): Promise<void> {
  const { error } = await supabase.from('spends').delete().eq('id', id);
  if (error) throw error;
}
