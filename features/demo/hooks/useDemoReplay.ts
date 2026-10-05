import { useEffect, useMemo } from 'react';

import { useStops } from '@/features/planning/hooks/usePlanning';
import { useMembers, useMyMember } from '@/features/trip/hooks/useTrip';
import { useCurrentTrip } from '@/features/trip/store';
import { setFakeTime } from '@/lib/clock';
import { useDemo } from '@/lib/demo';
import { setDemoRoute, useDemoRoute } from '@/lib/location';
import { buildDemoRoute, demoDays, pickDemoDay } from '../route';

/**
 * While Demo mode is on: builds the fake route from the open trip's Day plan and hands it
 * to lib/location, and starts the fake clock at the top of Day 1 for a newly opened trip.
 * The day replayed follows the fake time (it moves on to Day 2 once its replay starts).
 */
export function useDemoReplay() {
  const enabled = useDemo((s) => s.enabled);
  const fakeTime = useDemo((s) => s.fakeTime);
  const anchor = useDemo((s) => s.anchor);
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const activeTrip = enabled ? tripId : undefined;
  const stops = useStops(activeTrip);
  const members = useMembers(activeTrip);
  const me = useMyMember(activeTrip);

  const day = useMemo(() => pickDemoDay(stops.data ?? [], fakeTime), [stops.data, fakeTime]);
  const route = useMemo(() => {
    if (!activeTrip || day == null || !stops.data) return null;
    return buildDemoRoute({
      tripId: activeTrip,
      day,
      stops: stops.data,
      members: (members.data ?? []).map((m) => ({ id: m.id, name: m.display_name })),
      meId: me?.id ?? null,
    });
  }, [activeTrip, day, stops.data, members.data, me?.id]);

  useEffect(() => {
    setDemoRoute(route);
  }, [route]);
  useEffect(() => () => setDemoRoute(null), []);

  // A trip opened for the first time in Demo mode (or after Reset) starts 30 min before Day 1.
  useEffect(() => {
    if (!activeTrip || anchor === activeTrip || !stops.data) return;
    const first = demoDays(stops.data)[0];
    if (first) setFakeTime(first.startsAt, activeTrip);
  }, [activeTrip, anchor, stops.data]);

  return {
    route: useDemoRoute((s) => s.route),
    tripId: activeTrip,
    loading: stops.isLoading,
  };
}
