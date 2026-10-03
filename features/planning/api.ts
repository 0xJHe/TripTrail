import type { TripOptionDraft } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import type { Trip } from '@/features/trip/types';
import type { DateWindow } from './dateFinder';
import type { Preferences, TripOption, Vote } from './types';

export async function fetchPreferences(tripId: string): Promise<Preferences[]> {
  const { data, error } = await supabase.from('preferences').select('*').eq('trip_id', tripId);
  if (error) throw error;
  return ((data ?? []) as Preferences[]).map((p) => ({
    ...p,
    daily_budget: p.daily_budget == null ? null : Number(p.daily_budget),
    free_dates: p.free_dates ?? [],
    food_needs: p.food_needs ?? [],
    must_haves: p.must_haves ?? [],
  }));
}

export type PreferencesInput = Omit<Preferences, 'updated_at'>;

export async function savePreferences(prefs: PreferencesInput): Promise<void> {
  const { error } = await supabase
    .from('preferences')
    .upsert({ ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'member_id' });
  if (error) throw error;
}

export async function fetchOptions(tripId: string): Promise<TripOption[]> {
  const { data, error } = await supabase
    .from('trip_options')
    .select('*')
    .eq('trip_id', tripId)
    .order('position', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as TripOption[]).map((o) => ({ ...o, cost_per_person: Number(o.cost_per_person) }));
}

export async function fetchVotes(tripId: string): Promise<Vote[]> {
  const { data, error } = await supabase.from('votes').select('*').eq('trip_id', tripId);
  if (error) throw error;
  return (data ?? []) as Vote[];
}

export async function castVote(vote: Vote): Promise<void> {
  const { error } = await supabase.from('votes').upsert(vote, { onConflict: 'member_id,option_id' });
  if (error) throw error;
}

/**
 * Move the trip from preferences to voting. Only one member wins this, so
 * options are made once even if two people tap at the same moment.
 */
export async function claimVoting(tripId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('trips')
    .update({ stage: 'voting' })
    .eq('id', tripId)
    .eq('stage', 'preferences')
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

export interface OptionToSave {
  draft: TripOptionDraft;
  window: DateWindow | null;
  fitsEveryone: boolean;
}

export async function insertOptions(tripId: string, options: OptionToSave[]): Promise<void> {
  const rows = options.map(({ draft, window, fitsEveryone }, position) => ({
    trip_id: tripId,
    position,
    name: draft.name,
    cost_per_person: draft.costPerPerson,
    start_date: window?.start ?? null,
    end_date: window?.end ?? null,
    tags: draft.tags,
    summary: draft.dayTitles.map((t, i) => `Day ${i + 1} ${t}`).join(' · '),
    fits_everyone: fitsEveryone,
    plan_json: {
      days: draft.days,
      scene: draft.scene,
      covers: draft.covers,
      avoids: draft.avoids,
      halal: draft.halal,
      dayTitles: draft.dayTitles,
    },
  }));
  const { error } = await supabase.from('trip_options').insert(rows);
  if (error) throw error;
}

/** Lock in the winner: destination, dates and stage. */
export async function chooseWinner(tripId: string, option: TripOption, window: DateWindow | null): Promise<void> {
  const patch: Partial<Trip> = {
    winning_option_id: option.id,
    destination: option.name,
    stage: 'decided',
    start_date: window?.start ?? option.start_date,
    end_date: window?.end ?? option.end_date,
  };
  const { error } = await supabase.from('trips').update(patch).eq('id', tripId);
  if (error) throw error;
}
