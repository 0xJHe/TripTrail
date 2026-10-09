import { useQuery } from '@tanstack/react-query';

import { clockOf } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { now, useNow } from '@/lib/clock';
import { useDemoRoute } from '@/lib/location';
import { areaOf } from '@/supabase/functions/_shared/weather';
import { fetchWeather } from '../api';
import { demoRainAt, nextWeatherText, nowWeatherText, type WeatherText } from '../weather';

const MIN = 60_000;
const HOUR = 60 * MIN;

const placeOf = (s: Stop | null) => (s && s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null);

export const weatherKeys = {
  /** Every weather query of a trip (the rain check reads the latest one). */
  trip: (tripId: string | undefined) => ['weather', tripId] as const,
};

/**
 * Weather for the Now block (current, at `here`) and the Next card (forecast for `next`
 * at its start time). Refreshed every 30 min; any failure just hides the line.
 * Demo mode: the stops' real locations, with the demo route's rain moment on top.
 */
export function useWeather(
  tripId: string | undefined,
  here: Stop | null,
  next: Stop | null,
): { now: WeatherText | null; next: WeatherText | null } {
  const time = useNow().getTime();
  const route = useDemoRoute((s) => s.route);
  const herePt = placeOf(here);
  const nextPt = placeOf(next);
  const nextAt = next?.planned_time ? Date.parse(next.planned_time) : null;

  const query = useQuery({
    // Demo: the fake clock jumps, so "minutes until the next stop" changes; refetch per fake hour.
    queryKey: [
      ...weatherKeys.trip(tripId),
      herePt && areaOf(herePt),
      nextPt && areaOf(nextPt),
      next?.planned_time ?? null,
      route ? Math.floor(time / HOUR) : null,
    ],
    queryFn: () =>
      fetchWeather(tripId!, {
        now: herePt,
        next: nextPt ? { ...nextPt, inMinutes: nextAt == null ? 0 : Math.round((nextAt - now().getTime()) / MIN) } : null,
      }),
    enabled: !!tripId && (!!herePt || !!nextPt),
    staleTime: 30 * MIN,
    refetchInterval: 30 * MIN,
    retry: false,
  });

  const data = query.data;
  return {
    now: herePt ? nowWeatherText(data?.now ?? null, demoRainAt(route, herePt, time), new Date(time).getHours()) : null,
    next: nextPt
      ? nextWeatherText(
          data?.next ?? null,
          clockOf(next?.planned_time ?? null),
          nextAt != null ? demoRainAt(route, nextPt, nextAt) : null,
          new Date(nextAt ?? time).getHours(),
        )
      : null,
  };
}
