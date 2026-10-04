import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { tripKeys } from '@/features/trip/hooks/useTrip';
import { useCurrentTrip } from '@/features/trip/store';
import type { Member } from '@/features/trip/types';
import { buildPlan, chooseOption } from '../api';
import type { OptionResult } from '../tally';
import type { PlanningData } from './usePlanningData';

/**
 * Choosing a trip and building the plan. When the plan gets built (by me or
 * anyone else in the group) everyone is taken to the same Day plan.
 */
export function useChooseTrip(data: PlanningData) {
  const queryClient = useQueryClient();
  const setCurrentTrip = useCurrentTrip((s) => s.setCurrentTrip);
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { trip, me } = data;
  const tripId = trip?.id;
  const stage = trip?.stage;

  const openPlan = useRef(() => {});
  openPlan.current = () => {
    if (!tripId) return;
    setCurrentTrip(tripId);
    router.replace('/plan');
  };

  // Someone built the plan while I was looking at the results: follow them to it.
  const lastStage = useRef(stage);
  useEffect(() => {
    if (lastStage.current && lastStage.current !== 'decided' && stage === 'decided') openPlan.current();
    lastStage.current = stage;
  }, [stage]);

  async function choose(optionId: string) {
    if (!me || !tripId) return;
    setChoosingId(optionId);
    setError(null);
    // Show my choice straight away; Realtime brings everyone else's.
    queryClient.setQueryData<Member[]>(tripKeys.members(tripId), (old) =>
      old?.map((m) => (m.id === me.id ? { ...m, chosen_option_id: optionId } : m)),
    );
    try {
      await chooseOption(me.id, optionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your choice. Try again.');
    } finally {
      await queryClient.invalidateQueries({ queryKey: tripKeys.members(tripId) });
      setChoosingId(null);
    }
  }

  async function build(result: OptionResult) {
    if (!trip) return;
    setBuilding(true);
    setError(null);
    try {
      await buildPlan(trip, result.option, result.fit.window, data.needsHalal);
      lastStage.current = 'decided'; // don't navigate twice when Realtime reports it
      await queryClient.invalidateQueries({ queryKey: tripKeys.trip(trip.id) });
      openPlan.current();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the plan. Check your internet and try again.');
      setBuilding(false);
    }
  }

  return { choose, choosingId, build, building, error, openPlan: () => openPlan.current() };
}
