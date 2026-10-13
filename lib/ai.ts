// AI trip options and itineraries, made by Supabase Edge Functions (Gemini + Google Places).
// A real trip never gets sample options or a sample plan: when no Gemini model gives a
// usable answer the functions say why ({ status: 'busy' | 'limit' }) and AiUnavailableError
// is thrown, so the screen saves nothing and shows the message with Try again. If a
// function can't be reached at all, a plain error is thrown (the screen offers Try again).
// The sample generators stay exported only for clearly labelled examples.

import { supabase } from '@/lib/supabase';
import type { StopDraft } from '@/supabase/functions/_shared/itinerary';
import type { TripOptionDraft } from '@/supabase/functions/_shared/tripOptions';

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

/** Why the AI gave nothing: 'busy' = try again in a minute; 'limit' = today's free AI limit is reached. */
export type AiStop = 'busy' | 'limit';

/** No Gemini model gave a usable answer: nothing to save; the screen shows why, with Try again. */
export class AiUnavailableError extends Error {
  status: AiStop;
  constructor(status: AiStop) {
    super(status === 'limit' ? "Today's free AI limit has been reached" : 'Our AI is busy right now');
    this.name = 'AiUnavailableError';
    this.status = status;
  }
}

/** 'busy' / 'limit' when `e` is an AiUnavailableError, else null. */
export const aiStopOf = (e: unknown): AiStop | null => (e instanceof AiUnavailableError ? e.status : null);

/** The function couldn't be reached (offline, timeout): shown with Try again. */
export const AI_UNREACHABLE = "Couldn't reach our AI. Check your connection and try again.";

/** What the functions answer besides the options / stops. */
type ChainReply = { status?: 'ok' | AiStop; model?: string | null };

/** Turn the function's reply into data or a clear error (never samples). */
async function call<T>(name: string, body: Record<string, unknown>, has: (data: T) => boolean): Promise<T> {
  let res: Awaited<ReturnType<typeof supabase.functions.invoke<T & ChainReply>>>;
  try {
    res = await supabase.functions.invoke<T & ChainReply>(name, { body });
  } catch (e) {
    console.warn(`${name} couldn't be reached:`, e instanceof Error ? e.message : e);
    throw new Error(AI_UNREACHABLE);
  }
  const { data, error } = res;
  if (error) {
    console.warn(`${name} failed:`, error.message);
    // FunctionsFetchError / FunctionsRelayError: never got an answer from the function.
    throw new Error(/fetch|relay|network/i.test(`${error.name} ${error.message}`) ? AI_UNREACHABLE : error.message);
  }
  if (data?.status === 'busy' || data?.status === 'limit') throw new AiUnavailableError(data.status);
  console.log(`${name}: ${data?.model ? `answered by ${data.model}` : 'no reply'}`);
  if (!data || !has(data)) throw new AiUnavailableError('busy');
  return data;
}

export interface TripOptionsResult {
  options: TripOptionDraft[];
  /** Why the options can't fit everyone, e.g. "No dates suit all 4, these suit 3 of 4". */
  note: string | null;
}

/**
 * AI trip options for this trip from everyone's answers, with a photo per option.
 * Throws AiUnavailableError ('busy' / 'limit') when there are none, or an Error.
 */
export async function generateTripOptions(tripId: string): Promise<TripOptionsResult> {
  const data = await call<TripOptionsResult>('generate-trip-options', { tripId }, (d) => Array.isArray(d.options) && d.options.length > 0);
  return { options: data.options, note: data.note ?? null };
}

export interface ItineraryResult {
  stops: StopDraft[];
  /** Small note to show, e.g. when Google's daily limit was reached. */
  note: string | null;
}

/**
 * AI day-by-day stops for the chosen trip, with real addresses from Google Places.
 * Throws AiUnavailableError ('busy' / 'limit') when there is no plan, or an Error.
 */
export async function generateItinerary(tripId: string, optionId: string, start: string | null): Promise<ItineraryResult> {
  const data = await call<ItineraryResult>('generate-itinerary', { tripId, optionId, start }, (d) => Array.isArray(d.stops) && d.stops.length > 0);
  return { stops: data.stops, note: data.note ?? null };
}
