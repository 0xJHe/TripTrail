import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useDemoStops } from '@/features/demo/hooks/useDemoStops';
import { buildDemoRoute } from '@/features/demo/route';
import { useDayPlan } from '@/features/planning/hooks/useDayPlan';
import { dayDate } from '@/features/planning/stops';
import { longDate } from '@/features/today/todayPlan';
import { useMyMember } from '@/features/trip/hooks/useTrip';
import { memberAvatars } from '@/features/trip/members';
import { useCurrentTrip } from '@/features/trip/store';
import { now, useNow } from '@/lib/clock';
import { useDemo } from '@/lib/demo';
import { sampleRoute, type DemoRoute } from '@/lib/location';
import { fetchMyPositions } from '../api';
import { openDayEndsAt, visitedBy } from '../dayEnd';
import { dayWeatherOf, useDayWeather, weatherSummary } from '../dayWeather';
import { hoursOutMs, smoothTrail, trailMeters, type Fix } from '../trail';

const MIN = 60_000;

/** Demo mode: this phone's position on the demo route every minute, up to time t. */
function demoFixes(route: DemoRoute, t: number): Fix[] {
  const out: Fix[] = [];
  const end = Math.min(route.endsAt, t);
  for (let at = route.startsAt; at <= end; at += MIN) {
    const me = sampleRoute(route, at).me;
    if (me) out.push({ lat: me.lat, lng: me.lng, at });
  }
  return out;
}

/**
 * Everything on the day recap card (prototype screen 15) for one trip day: this person's trail
 * from their saved positions (Demo mode: the demo route), the stops they visited, km, hours out
 * and the day's weather from readings already saved on the phone. No Google or Gemini calls.
 */
export function useDayRecap(day: number) {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const plan = useDayPlan(tripId);
  const me = useMyMember(tripId);
  const demo = useDemo((s) => s.enabled);
  const time = useNow().getTime();
  const weatherDays = useDayWeather((s) => s.days);

  const isDay = day >= 1 && day <= plan.days;
  const date = isDay ? dayDate(plan.start, day) : null;
  const dayStops = useMemo(() => plan.stops.filter((s) => s.day_number === day), [plan.stops, day]);
  // The day's positions: from its midnight to when it ends (1 h before the next day's first stop).
  const window = useMemo(() => {
    if (!date) return null;
    const [y, m, d] = date.split('-').map(Number);
    const next = plan.stops.filter((s) => s.day_number === day + 1);
    return { from: new Date(y, m - 1, d).getTime(), to: openDayEndsAt(next, dayDate(plan.start, day + 1)) };
  }, [date, plan.stops, plan.start, day]);

  const positions = useQuery({
    queryKey: ['recapPositions', tripId, me?.id, day, window?.from],
    queryFn: () =>
      fetchMyPositions(tripId!, me!.id, new Date(window!.from).toISOString(), new Date(Math.min(window!.to, now().getTime())).toISOString()),
    enabled: !demo && !!tripId && !!me && !!window,
    staleTime: 5 * MIN,
  });

  // Demo mode: the day's demo route, built the same way as the replay.
  const demoStops = useDemoStops(demo ? tripId : undefined);
  const route = useMemo(() => {
    if (!demo || !tripId || !isDay || !demoStops.data) return null;
    return buildDemoRoute({
      tripId,
      day,
      stops: demoStops.data,
      base: demoStops.base,
      members: plan.members.map((m) => ({ id: m.id, name: m.display_name })),
      meId: me?.id ?? null,
    });
  }, [demo, tripId, isDay, day, demoStops.data, demoStops.base, plan.members, me?.id]);

  const fixes = useMemo(() => {
    if (demo) return route ? demoFixes(route, time) : [];
    const to = Math.min(window?.to ?? Infinity, time);
    return (positions.data ?? []).filter((f) => f.at <= to);
  }, [demo, route, time, positions.data, window?.to]);

  const trail = useMemo(() => smoothTrail(fixes), [fixes]);

  const visited = useMemo(() => {
    const arrivedInDemo = new Set(
      (route?.events ?? []).filter((e) => e.kind === 'arrive' && e.at <= time && e.stopId).map((e) => e.stopId!),
    );
    return dayStops.filter((s) => s.lat != null && s.lng != null && (visitedBy(s, time) || arrivedInDemo.has(s.id)));
  }, [dayStops, route, time]);

  const ends = visited.length > 0 ? visited : dayStops;
  const from = ends[0]?.name;
  const to = ends[ends.length - 1]?.name;

  return {
    tripId,
    trip: plan.trip,
    loading: plan.loading || (!demo && positions.isLoading && positions.fetchStatus !== 'idle'),
    error: positions.error ? "Couldn't load your route. Check the connection and open the recap again." : null,
    refetch: positions.refetch,
    isDay,
    day,
    /** "DAY 1 · SUNDAY 12 OCT". */
    dateLine: date ? `Day ${day} · ${longDate(date)}`.toUpperCase() : '',
    /** "George Town → Batu Ferringhi" (first and last stop visited). */
    route: from && to && from !== to ? `${from} → ${to}` : (from ?? ''),
    trail,
    hasPositions: fixes.length > 1,
    stops: visited.map((s) => ({ id: s.id, name: s.name, category: s.category, lat: s.lat!, lng: s.lng! })),
    meters: trailMeters(trail),
    outMs: hoursOutMs(fixes),
    weather: weatherSummary(dayWeatherOf(weatherDays, tripId, day), time),
    people: memberAvatars(plan.members),
  };
}

export type DayRecap = ReturnType<typeof useDayRecap>;
