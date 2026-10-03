import { useMemo } from 'react';

import { useUserId } from '@/features/trip/authStore';
import { useMembers, useTrip } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { answered, optionFit, someoneNeeds, type OptionFit } from '../optionFit';
import { useOptions, usePreferences, useVotes } from './usePlanning';

/** Everything the swipe and results screens need, kept live with Realtime. */
export function usePlanningData(tripId: string | undefined) {
  const userId = useUserId();
  const trip = useTrip(tripId);
  const members = useMembers(tripId);
  const prefs = usePreferences(tripId);
  const options = useOptions(tripId);
  const votes = useVotes(tripId);
  useTripRealtime(tripId, ['trips', 'members', 'preferences', 'trip_options', 'votes']);

  const memberList = useMemo(() => members.data ?? [], [members.data]);
  const answeredPrefs = useMemo(() => answered(prefs.data ?? []), [prefs.data]);
  const optionList = useMemo(() => options.data ?? [], [options.data]);
  const fits = useMemo(() => {
    const map = new Map<string, OptionFit>();
    for (const o of optionList) map.set(o.id, optionFit(o, answeredPrefs, memberList.length, trip.data));
    return map;
  }, [optionList, answeredPrefs, memberList.length, trip.data]);

  const loading = trip.isLoading || members.isLoading || prefs.isLoading || options.isLoading || votes.isLoading;
  const error = trip.error || members.error || prefs.error || options.error || votes.error;

  return {
    trip: trip.data,
    members: memberList,
    me: memberList.find((m) => m.user_id === userId) ?? null,
    answeredPrefs,
    answeredIds: new Set(answeredPrefs.map((p) => p.member_id)),
    options: optionList,
    votes: votes.data ?? [],
    fits,
    needsHalal: someoneNeeds(answeredPrefs, 'Halal'),
    solo: memberList.length <= 1,
    loading,
    error,
  };
}

export type PlanningData = ReturnType<typeof usePlanningData>;
