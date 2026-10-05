import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

/** Tables we listen to, and the React Query key each one refreshes. */
const TABLE_KEYS = {
  trips: 'trip',
  members: 'members',
  preferences: 'preferences',
  trip_options: 'options',
  votes: 'votes',
  stops: 'stops',
  pins: 'pins',
  late_alerts: 'lateAlerts',
} as const;

export type RealtimeTable = keyof typeof TABLE_KEYS;

/**
 * Refetch the trip's queries whenever another member changes these tables.
 * Filtered by trip_id, removed on unmount.
 */
export function useTripRealtime(tripId: string | undefined, tables: RealtimeTable[]) {
  const queryClient = useQueryClient();
  const tableList = tables.join(',');

  useEffect(() => {
    if (!tripId) return;
    const channel = supabase.channel(`trip-${tripId}-${Math.random().toString(36).slice(2, 8)}`);
    for (const table of tableList.split(',') as RealtimeTable[]) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: table === 'trips' ? `id=eq.${tripId}` : `trip_id=eq.${tripId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: [TABLE_KEYS[table], tripId] });
        },
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, tableList, queryClient]);
}
