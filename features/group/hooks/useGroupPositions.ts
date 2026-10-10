import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';
import { fetchLatestLocations } from '../api';
import { latestByMember } from '../groupMap';
import type { LocationRow } from '../types';

export const locationKeys = { latest: (tripId: string) => ['locations', tripId] as const };

/**
 * Everyone's newest position since `since` (ISO), kept live: new rows in `locations`
 * come in through Realtime (filtered by trip_id, removed on unmount) and replace
 * that member's older one, without refetching.
 */
export function useGroupPositions(tripId: string | undefined, memberIds: string[], since: string | null) {
  const queryClient = useQueryClient();
  const ids = memberIds.join(',');
  const enabled = !!tripId && since != null && memberIds.length > 0;
  const query = useQuery({
    queryKey: [...locationKeys.latest(tripId ?? ''), since, ids],
    queryFn: () => fetchLatestLocations(tripId!, ids.split(','), since!),
    enabled,
    // A safety net in case a Realtime message is missed.
    refetchInterval: 2 * 60_000,
  });

  useEffect(() => {
    if (!enabled || !tripId) return;
    const channel = supabase.channel(`locations-${tripId}-${Math.random().toString(36).slice(2, 8)}`);
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'locations', filter: `trip_id=eq.${tripId}` },
      (payload) => {
        const row = payload.new as LocationRow;
        if (since && Date.parse(row.recorded_at) < Date.parse(since)) return;
        queryClient.setQueriesData<LocationRow[]>({ queryKey: locationKeys.latest(tripId) }, (old) =>
          old ? [...latestByMember([...old, row]).values()] : old,
        );
      },
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, tripId, since, queryClient]);

  return query;
}
