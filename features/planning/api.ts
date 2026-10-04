import { generateItinerary, type TripOptionDraft } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import type { Trip } from '@/features/trip/types';
import type { DateWindow } from './dateFinder';
import { addDays } from './dates';
import { draftsToStops, planStart } from './stops';
import type { NewStop, Preferences, Stop, TripOption, Vote } from './types';

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

/** Save the options. `fitNote` = why they can't fit everyone (kept on every option). */
export async function insertOptions(tripId: string, options: OptionToSave[], fitNote: string | null = null): Promise<void> {
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
      landmark: draft.landmark ?? null,
      photo: draft.photo ?? null,
      photoLimited: draft.photoLimited ?? false,
      fitNote,
    },
  }));
  const { error } = await supabase.from('trip_options').insert(rows);
  if (error) throw error;
}

/** Choose (or change) the trip I want. Everyone sees it live on the Results screen. */
export async function chooseOption(memberId: string, optionId: string): Promise<void> {
  const { error } = await supabase.from('members').update({ chosen_option_id: optionId }).eq('id', memberId);
  if (error) throw error;
}

/**
 * Build the day-by-day plan for the trip everyone chose and save it. The
 * database only builds it once, even if several people tap at the same time.
 */
export async function buildPlan(
  trip: Trip,
  option: TripOption,
  window: DateWindow | null,
  halal: boolean,
): Promise<{ note: string | null }> {
  const days = option.plan_json.days;
  const start = window?.start ?? option.start_date ?? planStart(trip.start_date, []);
  const { stops, note } = await generateItinerary(trip.id, option.id, start, {
    destination: option.name,
    days,
    dayTitles: option.plan_json.dayTitles ?? [],
    halal,
  });
  const { error } = await supabase.rpc('build_plan', {
    p_trip: trip.id,
    p_option: option.id,
    p_start: start,
    p_end: addDays(start, days - 1),
    p_stops: draftsToStops(stops, start),
  });
  if (error) {
    if (/not everyone/i.test(error.message)) throw new Error('Not everyone has chosen this trip yet.');
    throw error;
  }
  return { note };
}

export async function fetchStops(tripId: string): Promise<Stop[]> {
  const { data, error } = await supabase.from('stops').select('*').eq('trip_id', tripId);
  if (error) throw error;
  return ((data ?? []) as Stop[]).map((s) => ({
    ...s,
    price: Number(s.price ?? 0),
    actual_cost: s.actual_cost == null ? null : Number(s.actual_cost),
  }));
}

export async function addStop(tripId: string, stop: NewStop): Promise<void> {
  const { error } = await supabase.from('stops').insert({ ...stop, trip_id: tripId });
  if (error) throw error;
}

export type StopPatch = Partial<Omit<NewStop, 'position'>>;

export async function updateStop(id: string, patch: StopPatch): Promise<void> {
  const { error } = await supabase.from('stops').update(patch).eq('id', id);
  if (error) throw error;
}

/**
 * Take a stop out of the plan. It's marked "dropped" rather than deleted so the
 * change reaches everyone live (Realtime can't filter deletes by trip).
 */
export async function deleteStop(id: string): Promise<void> {
  const { error } = await supabase.from('stops').update({ status: 'dropped' }).eq('id', id);
  if (error) throw error;
}

export interface PlaceSuggestion {
  placeId: string;
  name: string;
  detail: string;
}

export interface PickedPlace {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
}

/** Up to 5 real places matching what's typed (Google Places via the place-search function). */
export async function searchPlaces(
  tripId: string,
  input: string,
  sessionToken: string,
  near: { lat: number; lng: number } | null,
): Promise<{ suggestions: PlaceSuggestion[]; limited: boolean }> {
  const { data, error } = await supabase.functions.invoke<{ suggestions: PlaceSuggestion[]; limited: boolean }>(
    'place-search',
    { body: { tripId, action: 'autocomplete', input, sessionToken, near } },
  );
  if (error) throw error;
  return { suggestions: (data?.suggestions ?? []).slice(0, 5), limited: !!data?.limited };
}

/** Address and location of a picked suggestion. Ends the search session. */
export async function getPlace(
  tripId: string,
  placeId: string,
  sessionToken: string,
): Promise<{ place: PickedPlace | null; limited: boolean }> {
  const { data, error } = await supabase.functions.invoke<{ place: PickedPlace | null; limited: boolean }>('place-search', {
    body: { tripId, action: 'details', placeId, sessionToken },
  });
  if (error) throw error;
  return { place: data?.place ?? null, limited: !!data?.limited };
}
