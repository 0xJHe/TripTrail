import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { generateTripOptions } from '@/lib/ai';
import { claimVoting, insertOptions } from '../api';
import { optionFit } from '../optionFit';
import type { PlanningData } from './usePlanningData';

/**
 * Make the trip options from everyone's answers. Runs by itself once all
 * members have answered; `generate` lets the group go ahead without waiting.
 */
export function useGenerateOptions(data: PlanningData) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);
  const { trip, members, answeredPrefs, options, loading } = data;

  const generate = useCallback(async () => {
    if (!trip || answeredPrefs.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      const { options: drafts } = await generateTripOptions(trip.id, {
        destination: trip.destination,
        lengthMin: trip.length_min ?? trip.length_days ?? 2,
        lengthMax: trip.length_days ?? 3,
        members: answeredPrefs.map((p) => ({
          dailyBudget: p.daily_budget,
          foodNeeds: p.food_needs,
          mustHaves: p.must_haves,
          noGo: p.no_go,
        })),
      });
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
      if (mine) await insertOptions(trip.id, toSave);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trip', trip.id] }),
        queryClient.invalidateQueries({ queryKey: ['options', trip.id] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make trip options. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [trip, answeredPrefs, members.length, queryClient]);

  const everyoneAnswered = members.length > 0 && members.every((m) => data.answeredIds.has(m.id));

  useEffect(() => {
    if (loading || autoTried.current || generating || !trip) return;
    if (trip.stage === 'preferences' && everyoneAnswered) {
      autoTried.current = true;
      generate();
    }
  }, [loading, trip, everyoneAnswered, generating, generate]);

  return {
    generate,
    generating,
    error,
    everyoneAnswered,
    /** Still answering questions, or voting started but options haven't arrived. */
    waiting: !!trip && (trip.stage === 'preferences' || options.length === 0),
  };
}
