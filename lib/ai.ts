// AI trip options and itineraries, made by Supabase Edge Functions (Gemini + Google Places).
// The functions fall back to sample data themselves; if a function can't be
// reached at all, the same sample data is made here so the app never gets stuck.
// Only when every Gemini model is busy for the minute do they answer { busy: true }:
// then AiBusyError is thrown (not samples) so the screen can offer "Try again".

import { supabase } from '@/lib/supabase';
import { sampleItinerary, type ItineraryRequest, type StopDraft } from '@/supabase/functions/_shared/itinerary';
import {
  fitNote,
  groupLimits,
  sampleTripOptions,
  type TripOptionDraft,
  type TripOptionsRequest,
} from '@/supabase/functions/_shared/tripOptions';

export {
  OPTION_COUNT,
  sampleTripOptions,
  type MemberAnswers,
  type OptionPhoto,
  type SceneKind,
  type TripOptionDraft,
  type TripOptionsRequest,
} from '@/supabase/functions/_shared/tripOptions';

export { sampleItinerary, type ItineraryRequest, type StopCategory, type StopDraft } from '@/supabase/functions/_shared/itinerary';

/** Every Gemini model is busy for the minute: show "Our AI is busy right now" with a Try again button. */
export class AiBusyError extends Error {
  constructor() {
    super('Our AI is busy right now');
    this.name = 'AiBusyError';
  }
}

export const isAiBusy = (e: unknown): e is AiBusyError => e instanceof AiBusyError;

/** The function's reply when every model was busy, plus which model answered (shown in the dev logs). */
type ChainReply = { busy?: boolean; model?: string | null };

export interface TripOptionsResult {
  options: TripOptionDraft[];
  /** 'ai' = made by Gemini; 'sample' = fallback data. */
  source: 'ai' | 'sample';
  /** Why the options can't fit everyone, e.g. "No dates suit all 4, these suit 3 of 4". */
  note: string | null;
}

/**
 * Trip options for this trip from everyone's answers, with a photo per option.
 * `req` is only used to make sample options if the function can't be reached.
 * Throws AiBusyError when every model is busy for the minute.
 */
export async function generateTripOptions(tripId: string, req: TripOptionsRequest): Promise<TripOptionsResult> {
  try {
    const { data, error } = await supabase.functions.invoke<TripOptionsResult & ChainReply>('generate-trip-options', {
      body: { tripId },
    });
    if (error) throw error;
    if (data?.busy) throw new AiBusyError();
    console.log(`generate-trip-options: ${data?.model ? `answered by ${data.model}` : data?.source ?? 'no reply'}`);
    if (!data || !Array.isArray(data.options) || data.options.length === 0) throw new Error('No options in reply');
    return { options: data.options, source: data.source === 'ai' ? 'ai' : 'sample', note: data.note ?? null };
  } catch (e) {
    if (isAiBusy(e)) throw e;
    console.warn('generate-trip-options failed, using sample options:', e instanceof Error ? e.message : e);
    const options = sampleTripOptions(req);
    return { options, source: 'sample', note: fitNote(options, groupLimits(req), req) };
  }
}

export interface ItineraryResult {
  stops: StopDraft[];
  /** 'ai' = made by Gemini; 'sample' = fallback data. */
  source: 'ai' | 'sample';
  /** Small note to show, e.g. when Google's daily limit was reached. */
  note: string | null;
}

/**
 * Day-by-day stops for the chosen trip, with real addresses from Google Places.
 * `fallback` is only used to make the sample plan if the function can't be reached.
 * Throws AiBusyError when every model is busy for the minute.
 */
export async function generateItinerary(
  tripId: string,
  optionId: string,
  start: string | null,
  fallback: ItineraryRequest,
): Promise<ItineraryResult> {
  try {
    const { data, error } = await supabase.functions.invoke<ItineraryResult & ChainReply>('generate-itinerary', {
      body: { tripId, optionId, start },
    });
    if (error) throw error;
    if (data?.busy) throw new AiBusyError();
    console.log(`generate-itinerary: ${data?.model ? `answered by ${data.model}` : data?.source ?? 'no reply'}`);
    if (!data || !Array.isArray(data.stops) || data.stops.length === 0) throw new Error('No stops in reply');
    return { stops: data.stops, source: data.source === 'ai' ? 'ai' : 'sample', note: data.note ?? null };
  } catch (e) {
    if (isAiBusy(e)) throw e;
    console.warn('generate-itinerary failed, using the sample plan:', e instanceof Error ? e.message : e);
    return { stops: sampleItinerary(fallback), source: 'sample', note: null };
  }
}
