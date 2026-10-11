import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { tripKeys } from '@/features/trip/hooks/useTrip';
import { isAiBusy } from '@/lib/ai';
import { useCurrentTrip } from '@/features/trip/store';
import type { Member } from '@/features/trip/types';
import { buildPlan, chooseOption } from '../api';
import type { OptionResult } from '../tally';
import type { PlanningData } from './usePlanningData';

/**
 * Choosing a trip and building the plan. When the plan gets built (by me or
 * anyone else in the group) everyone is taken to the same Day plan. A built
 * plan is never made again. `busy`: every AI model was busy, so the screen
 * shows "Our AI is busy right now" with Try again.
 */
export function useChooseTrip(data: PlanningData) {
  const queryClient = useQueryClient();
  const setCurrentTrip = useCurrentTrip((s) => s.setCurrentTrip);
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { trip, me } = data;
  const tripId = trip?.id;
  const stage = trip?.stage;

  const openPlan = useRef((_note?: string | null) => {});
  openPlan.current = (note?: string | null) => {
    if (!tripId) return;
    setCurrentTrip(tripId);
    router.replace(note ? { pathname: '/plan', params: { note } } : '/plan');
  };

  // Someone built the plan while I was looking at the results: follow them to it.
  const lastStage = useRef(stage);
  const buildingRef = useRef(false); // I'm building: I open the plan myself, with its note
  useEffect(() => {
    const builtByOthers = lastStage.current && lastStage.current !== 'decided' && stage === 'decided';
    if (builtByOthers && !buildingRef.current) openPlan.current();
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
    if (trip.stage === 'decided') return openPlan.current(); // already built: never make it again
    setBuilding(true);
    buildingRef.current = true;
    setError(null);
    setBusy(false);
    try {
      const { note } = await buildPlan(trip, result.option, result.fit.window, data.needsHalal);
      lastStage.current = 'decided'; // don't navigate twice when Realtime reports it
      await queryClient.invalidateQueries({ queryKey: tripKeys.trip(trip.id) });
      openPlan.current(note);
    } catch (e) {
      if (isAiBusy(e)) setBusy(true);
      else setError(e instanceof Error ? e.message : 'Could not build the plan. Check your internet and try again.');
      setBuilding(false);
      buildingRef.current = false;
    }
  }

  return { choose, choosingId, build, building, error, busy, openPlan: () => openPlan.current() };
}
