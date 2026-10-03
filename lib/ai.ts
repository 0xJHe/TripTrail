// AI trip options. Calls the Supabase Edge Function generate-trip-options (Gemini).
// The function already falls back to sample options when Gemini fails; if the
// function itself can't be reached, the same sample options are made here.

import { supabase } from '@/lib/supabase';
import { sampleTripOptions, type TripOptionDraft, type TripOptionsRequest } from '@/supabase/functions/_shared/tripOptions';

export {
  OPTION_COUNT,
  sampleTripOptions,
  type MemberAnswers,
  type SceneKind,
  type TripOptionDraft,
  type TripOptionsRequest,
} from '@/supabase/functions/_shared/tripOptions';

export interface TripOptionsResult {
  options: TripOptionDraft[];
  /** 'ai' = made by Gemini; 'sample' = fallback data. */
  source: 'ai' | 'sample';
}

/**
 * Trip options for this trip from everyone's answers. `req` is only used to
 * make sample options if the function can't be reached.
 */
export async function generateTripOptions(tripId: string, req: TripOptionsRequest): Promise<TripOptionsResult> {
  try {
    const { data, error } = await supabase.functions.invoke<TripOptionsResult>('generate-trip-options', {
      body: { tripId },
    });
    if (error) throw error;
    if (!data || !Array.isArray(data.options) || data.options.length === 0) throw new Error('No options in reply');
    return { options: data.options, source: data.source === 'ai' ? 'ai' : 'sample' };
  } catch (e) {
    console.warn('generate-trip-options failed, using sample options:', e instanceof Error ? e.message : e);
    return { options: sampleTripOptions(req), source: 'sample' };
  }
}
