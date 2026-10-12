import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSplitRows } from '@/features/group/hooks/useSplitRows';
import { hiddenStopsKey } from '@/features/group/splitStops';
import { useMyMember } from '@/features/trip/hooks/useTrip';
import { useNow } from '@/lib/clock';

import { fetchOptions, fetchPreferences, fetchStops, fetchVotes } from '../api';

export const planningKeys = {
  preferences: (tripId: string) => ['preferences', tripId] as const,
  options: (tripId: string) => ['options', tripId] as const,
  votes: (tripId: string) => ['votes', tripId] as const,
  stops: (tripId: string) => ['stops', tripId] as const,
};

export function usePreferences(tripId: string | undefined) {
  return useQuery({
    queryKey: planningKeys.preferences(tripId ?? ''),
    queryFn: () => fetchPreferences(tripId!),
    enabled: !!tripId,
  });
}

export function useOptions(tripId: string | undefined) {
  return useQuery({
    queryKey: planningKeys.options(tripId ?? ''),
    queryFn: () => fetchOptions(tripId!),
    enabled: !!tripId,
  });
}

export function useVotes(tripId: string | undefined) {
  return useQuery({
    queryKey: planningKeys.votes(tripId ?? ''),
    queryFn: () => fetchVotes(tripId!),
    enabled: !!tripId,
  });
}

/**
 * The trip's stops this person can see: the shared plan, plus group B's own stops during a
 * split only for group B (features/group/splitStops.ts). Everything that reads stops (Plan,
 * Today, arrive/leave, spend check, recap, Demo route) goes through here.
 */
export function useStops(tripId: string | undefined) {
  const query = useQuery({
    queryKey: planningKeys.stops(tripId ?? ''),
    queryFn: () => fetchStops(tripId!),
    enabled: !!tripId,
  });
  const all = query.data;
  const hasSplitStops = !!all?.some((s) => s.split_id);
  const splits = useSplitRows(hasSplitStops ? tripId : undefined).data;
  const meId = useMyMember(tripId)?.id ?? null;
  const t = useNow().getTime();
  // A string, so the list only changes when who sees what does (not on every clock tick).
  const hidden = hasSplitStops ? hiddenStopsKey(all!, splits ?? [], meId, t) : '';
  const data = useMemo(() => {
    if (!all || !hidden) return all;
    const out = new Set(hidden.split(','));
    return all.filter((s) => !out.has(s.id));
  }, [all, hidden]);
  return { ...query, data };
}
