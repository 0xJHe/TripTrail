import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useStops } from '@/features/planning/hooks/usePlanning';
import { dayCount, planStart, sortStops } from '@/features/planning/stops';
import { useTrip } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { useCurrentTrip } from '@/features/trip/store';
import { now, useNow } from '@/lib/clock';
import { getGroupLocation, useDemoRoute, useGroupLocation } from '@/lib/location';
import type { RainOption } from '@/supabase/functions/_shared/nearby';
import type { WeatherReply } from '@/supabase/functions/_shared/weather';
import { fetchRainAlerts, fetchRainOptions, raiseRainAlert } from '../api';
import { useLocationAccess } from '../permission';
import { rainAlertFor, rainInMinutes, rainTarget, slotStart } from '../rain';
import { todayView } from '../todayPlan';
import { weatherKeys } from './useWeather';

export const rainKeys = {
  alerts: (tripId: string) => ['rainAlerts', tripId] as const,
};

/** The trip's rain cards (kept live by Realtime in useRainCheck). */
export function useRainAlerts(tripId: string | undefined) {
  return useQuery({
    queryKey: rainKeys.alerts(tripId ?? ''),
    queryFn: () => fetchRainAlerts(tripId!),
    enabled: !!tripId,
  });
}

/**
 * The weather the Today card last fetched for this trip (current conditions and the hours
 * ahead), read from the React Query cache: the rain check never asks for weather itself.
 */
function lastWeather(queryClient: QueryClient, tripId: string): { reply: WeatherReply; at: number } | null {
  const latest = queryClient
    .getQueryCache()
    .findAll({ queryKey: weatherKeys.trip(tripId) })
    .filter((q) => q.state.data)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0];
  return latest ? { reply: latest.state.data as WeatherReply, at: latest.state.dataUpdatedAt } : null;
}

/**
 * When rain is coming within the hour at the group's position and the stop they're at (or
 * the next one) is outdoor, saves the rain card for everyone with up to 3 indoor options
 * (nearby-suggestion function, kind 'rain'). Once per stop. Mounted once in the tabs layout.
 * Time from lib/clock and position from lib/location, so Demo mode's rain moment drives it.
 */
export function useRainCheck() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const trip = useTrip(tripId);
  const stops = useStops(tripId);
  const rainAlerts = useRainAlerts(tripId);
  useTripRealtime(tripId, ['rain_alerts']);
  const route = useDemoRoute((s) => s.route);
  const demo = route != null;
  const permission = useLocationAccess((s) => s.permission);
  const location = useGroupLocation();
  const time = useNow().getTime();
  const queryClient = useQueryClient();
  const weather = tripId && !demo ? lastWeather(queryClient, tripId) : null;
  /** Stops already checked (a card is being saved, or was). */
  const done = useRef(new Set<string>());
  const busy = useRef(false);
  const lastTime = useRef<number | null>(null);

  // New trip, switching between demo and real, or Demo mode's clock going back (Reset):
  // start over. Reset's undo of the cards themselves runs in useEarlyCheck (undoDemoMoments).
  useEffect(() => {
    done.current.clear();
  }, [tripId, demo]);
  useEffect(() => {
    const last = lastTime.current;
    lastTime.current = time;
    if (demo && last != null && time < last) done.current.clear();
  }, [demo, time]);

  const center = location?.center ?? null;
  useEffect(() => {
    if (busy.current) return;
    const t = trip.data;
    if (!tripId || !t || t.stage !== 'decided' || !stops.data || !rainAlerts.data) return;
    if (!demo && permission !== 'granted') return;
    const sorted = sortStops(stops.data);
    const view = todayView({
      stage: t.stage,
      start: planStart(t.start_date, sorted),
      days: dayCount(sorted, t.length_days),
      stops: sorted,
      now: new Date(time),
    });
    if (view.kind !== 'day') return;
    const rainIn = rainInMinutes({ route, center, time, weather: weather?.reply ?? null });
    const stop = rainTarget({ now: view.now, next: view.next, time, rainIn, rainAlerts: rainAlerts.data });
    if (!stop || rainIn == null || done.current.has(stop.id)) return;

    busy.current = true;
    done.current.add(stop.id);
    const check = async () => {
      const at = now().getTime();
      const loc = await getGroupLocation();
      const from = loc?.center ?? { lat: stop.lat, lng: stop.lng };
      const starts = new Date(slotStart(stop, at));
      let options: RainOption[] = [];
      try {
        const reply = await fetchRainOptions(tripId, {
          stopId: stop.id,
          from,
          localMinutes: starts.getHours() * 60 + starts.getMinutes(),
        });
        options = reply.options;
      } catch (e) {
        console.warn('Rain options failed, showing the card without any:', e instanceof Error ? e.message : e);
      }
      await raiseRainAlert(rainAlertFor({ tripId, stop, now: at, rainIn, options }));
      queryClient.invalidateQueries({ queryKey: rainKeys.alerts(tripId) });
    };
    check()
      .catch((e) => {
        done.current.delete(stop.id); // couldn't save it: try again on the next tick
        console.warn('Rain check failed:', e instanceof Error ? e.message : e);
      })
      .finally(() => {
        busy.current = false;
      });
    // `center` and `weather` are read fresh each run; the clock, the position's time and the data drive it.
  }, [tripId, trip.data, stops.data, rainAlerts.data, time, demo, permission, weather?.at, location?.at]);
}
