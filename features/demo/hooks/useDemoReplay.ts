import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useMembers, useMyMember } from '@/features/trip/hooks/useTrip';
import { useCurrentTrip } from '@/features/trip/store';
import { useDemo } from '@/lib/demo';
import { setDemoRoute, useDemoRoute } from '@/lib/location';
import { initDemo } from '../api';
import { buildDemoRoute, demoDays, pickDemoDay } from '../route';
import { applyDemoSession } from './useDemoSession';
import { useDemoStops } from './useDemoStops';

/**
 * While Demo mode is on: builds the fake route from the open trip's Day plan and hands it
 * to lib/location, and starts the trip's shared fake clock at the top of Day 1 when nobody
 * has yet (Demo mode just turned on). Every phone builds the same route from the same plan,
 * members and shared clock, so everyone sees the same demo.
 * The day replayed follows the fake time (it moves on to Day 2 once its replay starts).
 * Accepting a running-late new day doesn't move the replay: it uses the times from before.
 * Running early does: the group walks to an added stop, and to a moved one at its new time
 * (else the running-late check would find them late for it), and to a place swapped in for
 * rain. The day's moments stay put.
 */
export function useDemoReplay() {
  const enabled = useDemo((s) => s.enabled);
  const fakeTime = useDemo((s) => s.fakeTime);
  const sessionTrip = useDemo((s) => s.tripId);
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const activeTrip = enabled ? tripId : undefined;
  const stops = useDemoStops(activeTrip);
  const members = useMembers(activeTrip);
  const me = useMyMember(activeTrip);

  const day = useMemo(() => pickDemoDay(stops.data ?? [], fakeTime), [stops.data, fakeTime]);
  const route = useMemo(() => {
    if (!activeTrip || day == null || !stops.data) return null;
    return buildDemoRoute({
      tripId: activeTrip,
      day,
      stops: stops.data,
      base: stops.base,
      members: (members.data ?? []).map((m) => ({ id: m.id, name: m.display_name })),
      meId: me?.id ?? null,
    });
  }, [activeTrip, day, stops.data, stops.base, members.data, me?.id]);

  useEffect(() => {
    setDemoRoute(route);
  }, [route]);
  useEffect(() => () => setDemoRoute(null), []);

  // Demo mode just turned on (no shared fake time yet): start 30 min before Day 1, for the
  // whole trip. The server only takes the first phone's call.
  const queryClient = useQueryClient();
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!activeTrip || sessionTrip !== activeTrip || fakeTime != null || !stops.data) return;
    const first = demoDays(stops.data)[0];
    if (!first || asked.current === activeTrip) return;
    asked.current = activeTrip;
    initDemo(activeTrip, first.startsAt, first.day)
      .then((session) => applyDemoSession(activeTrip, session, queryClient))
      .catch((e) => console.warn("Couldn't start the demo clock:", e instanceof Error ? e.message : e))
      .finally(() => {
        asked.current = null;
      });
  }, [activeTrip, sessionTrip, fakeTime, stops.data, queryClient]);

  // The fake start time: Day 1's replay start (Reset goes back there).
  const demoStart = useMemo(() => (stops.data ? (demoDays(stops.data)[0]?.startsAt ?? null) : null), [stops.data]);

  // The day the replay is on at fake time t (saved with each step).
  const dayAt = useCallback((t: number) => pickDemoDay(stops.data ?? [], t), [stops.data]);

  return {
    route: useDemoRoute((s) => s.route),
    tripId: activeTrip,
    demoStart,
    dayAt,
    loading: stops.isLoading,
  };
}
