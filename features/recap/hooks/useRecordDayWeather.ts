import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { dayDate } from '@/features/planning/stops';
import { weatherKeys } from '@/features/today/hooks/useWeather';
import { useCurrentTrip } from '@/features/trip/store';
import { now } from '@/lib/clock';
import type { HourWeather, WeatherReply } from '@/supabase/functions/_shared/weather';
import { useDayWeather, type WeatherSample } from '../dayWeather';
import { useOpenDay } from './useOpenDay';

const HOUR = 3_600_000;

/**
 * A reply's readings for the day that starts at `from` (ms): the current weather at t (now() on
 * lib/clock), then its forecast hours. The forecast is stamped with the real time; its hours are
 * moved onto lib/clock's (the same on a real trip; Demo mode's fake day otherwise loses them), so
 * every fetch through the day adds its next few hours.
 */
export function samplesOf(reply: WeatherReply, t: number, from: number): WeatherSample[] {
  const out: WeatherSample[] = [];
  if (reply.now) out.push({ at: t, tempC: reply.now.tempC, condition: reply.now.condition, kind: reply.now.kind, actual: true });
  const hours: HourWeather[] = [...(reply.soon ?? []), ...(reply.next ? [reply.next] : [])];
  // `soon` starts with the hour it was fetched in.
  const first = Math.min(...(reply.soon ?? []).map((h) => Date.parse(h.start)).filter((x) => !Number.isNaN(x)));
  const shift = Number.isFinite(first) ? Math.floor(t / HOUR) * HOUR - Math.floor(first / HOUR) * HOUR : 0;
  for (const h of hours) {
    const at = Date.parse(h.start) + shift;
    // Only this day's hours (a kept-going day runs a few hours past midnight).
    if (Number.isNaN(at) || at < from || at >= from + 30 * HOUR) continue;
    out.push({ at, tempC: h.tempC, condition: h.condition, kind: h.kind, actual: false });
  }
  return out;
}

/**
 * Saves the weather the Today card fetches (React Query cache) for the open trip day, so the
 * day recap can say "27° · mostly cloudy". No weather calls of its own.
 */
export function useRecordDayWeather() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const open = useOpenDay(tripId);
  const queryClient = useQueryClient();
  const dayRef = useRef({ day: open.day, from: 0 });
  const [y, m, d] = (open.day >= 1 ? dayDate(open.start, open.day) : '1970-01-01').split('-').map(Number);
  dayRef.current = { day: open.day, from: new Date(y, m - 1, d).getTime() };

  useEffect(() => {
    if (!tripId) return;
    const [root, trip] = weatherKeys.trip(tripId);
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const k = event.query.queryKey;
      const { day, from } = dayRef.current;
      if (k[0] !== root || k[1] !== trip || day < 1) return;
      const reply = event.query.state.data as WeatherReply | undefined;
      if (reply) useDayWeather.getState().record(tripId, day, samplesOf(reply, now().getTime(), from));
    });
  }, [tripId, queryClient]);
}
