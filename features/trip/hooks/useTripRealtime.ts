import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

/** Tables we listen to, and the React Query key each one refreshes. */
const TABLE_KEYS = {
  // Someone leaving updates the trip row (members_changed_at): their row and pins are gone.
  trips: ['trip', 'members', 'pins'],
  members: 'members',
  preferences: 'preferences',
  trip_options: 'options',
  votes: 'votes',
  stops: 'stops',
  pins: 'pins',
  meet_points: 'meetPoints',
  late_alerts: 'lateAlerts',
  early_alerts: 'earlyAlerts',
  rain_alerts: 'rainAlerts',
  spends: 'spends',
  day_closures: 'dayClosures',
  demo_sessions: 'demoSession',
  demo_batteries: 'demoBatteries',
} satisfies Record<string, string | string[]>;

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
          for (const key of ([] as string[]).concat(TABLE_KEYS[table])) {
            queryClient.invalidateQueries({ queryKey: [key, tripId] });
          }
        },
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, tableList, queryClient]);
}
