import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { weatherKeys } from '@/features/today/hooks/useWeather';
import { useCurrentTrip } from '@/features/trip/store';
import { now } from '@/lib/clock';
import type { WeatherReply } from '@/supabase/functions/_shared/weather';
import { useDayWeather } from '../dayWeather';
import { useOpenDay } from './useOpenDay';

/**
 * Saves the current weather the Today card fetches (React Query cache) for the open trip day,
 * so the day recap can say "31° · mostly sunny". No weather calls of its own.
 */
export function useRecordDayWeather() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const day = useOpenDay(tripId).day;
  const queryClient = useQueryClient();
  const dayRef = useRef(day);
  dayRef.current = day;

  useEffect(() => {
    if (!tripId) return;
    const [root, trip] = weatherKeys.trip(tripId);
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const k = event.query.queryKey;
      if (k[0] !== root || k[1] !== trip || dayRef.current < 1) return;
      const reply = event.query.state.data as WeatherReply | undefined;
      if (reply?.now) useDayWeather.getState().record(tripId, dayRef.current, reply.now, now().getTime());
    });
  }, [tripId, queryClient]);
}
