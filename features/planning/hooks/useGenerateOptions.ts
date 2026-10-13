import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { aiStopOf, generateTripOptions, type AiStop } from '@/lib/ai';
import { claimVoting, insertOptions } from '../api';
import { optionFit } from '../optionFit';
import type { PlanningData } from './usePlanningData';

/**
 * Make the trip options from everyone's answers. Runs by itself once all
 * members have answered; `generate` lets the group go ahead without waiting.
 * Saved options are never made again (only while the trip has none). When the
 * AI gives no options, `aiStop` says why ('busy' = try again in a minute, 'limit' =
 * today's free AI limit), nothing is saved and nothing runs by itself: the screen
 * shows the message with Try again (`generate`).
 */
export function useGenerateOptions(data: PlanningData) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiStop, setAiStop] = useState<AiStop | null>(null);
  const autoTried = useRef(false);
  const { trip, members, answeredPrefs, options, loading } = data;

  const generate = useCallback(async () => {
    if (!trip || answeredPrefs.length === 0 || options.length > 0) return;
    setGenerating(true);
    setError(null);
    setAiStop(null);
    try {
      const { options: drafts, note } = await generateTripOptions(trip.id);
      const toSave = drafts.map((draft) => {
        const fit = optionFit(
          {
            cost_per_person: draft.costPerPerson,
            plan_json: { days: draft.days, scene: draft.scene, covers: draft.covers, avoids: draft.avoids, halal: draft.halal, dayTitles: draft.dayTitles },
          },
          answeredPrefs,
          members.length,
          trip,
        );
        return { draft, window: fit.window, fitsEveryone: fit.fitsEveryone };
      });
      // Only the member who moves the trip to voting saves the options.
      const mine = trip.stage === 'preferences' ? await claimVoting(trip.id) : true;
      if (mine) await insertOptions(trip.id, toSave, note);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trip', trip.id] }),
        queryClient.invalidateQueries({ queryKey: ['options', trip.id] }),
      ]);
    } catch (e) {
      const stop = aiStopOf(e);
      if (stop) setAiStop(stop);
      else setError(e instanceof Error ? e.message : 'Could not make trip options. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [trip, answeredPrefs, options.length, members.length, queryClient]);

  const everyoneAnswered = members.length > 0 && members.every((m) => data.answeredIds.has(m.id));

  useEffect(() => {
    if (loading || autoTried.current || generating || !trip) return;
    if (trip.stage === 'preferences' && everyoneAnswered && options.length === 0) {
      autoTried.current = true;
      generate();
    }
  }, [loading, trip, everyoneAnswered, options.length, generating, generate]);

  return {
    generate,
    generating,
    error,
    aiStop,
    everyoneAnswered,
    /** Still answering questions, or voting started but options haven't arrived. */
    waiting: !!trip && (trip.stage === 'preferences' || options.length === 0),
  };
}
