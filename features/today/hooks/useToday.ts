import { useCallback, useMemo, useState } from 'react';

import { useSpendCheck } from '@/features/money/hooks/useSpends';
import { useDayPlan } from '@/features/planning/hooks/useDayPlan';
import type { Stop } from '@/features/planning/types';
import { useCurrentTrip } from '@/features/trip/store';
import { now as clockNow, useNow } from '@/lib/clock';
import { useDemoRoute, useGroupLocation } from '@/lib/location';
import { useLocationAccess } from '../permission';
import { todayView } from '../todayPlan';
import { useEarlyAlert } from './useEarlyAlert';
import { useLateAlert } from './useLateAlert';
import { useRainAlert } from './useRainAlert';
import { useSaveVisits } from './useSaveVisits';
import { useWeather } from './useWeather';

/** Everything the Today tab shows. Arrive / leave detection itself runs in useVisitTracker. */
export function useToday() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const plan = useDayPlan(tripId);
  const time = useNow();
  const location = useGroupLocation();
  const demo = useDemoRoute((s) => s.route) != null;
  const permission = useLocationAccess((s) => s.permission);
  const allowLocation = useLocationAccess((s) => s.allow);
  const save = useSaveVisits(tripId);
  const [leaving, setLeaving] = useState(false);

  const { trip, stops, days, start } = plan;
  const view = useMemo(
    () => (trip ? todayView({ stage: trip.stage, start, days, stops, now: time }) : null),
    [trip, start, days, stops, time],
  );
  const day = view?.kind === 'day' ? view : null;
  const dayStops = useMemo(() => (day ? stops.filter((s) => s.day_number === day.day) : []), [stops, day?.day]);
  const late = useLateAlert(tripId, day?.next ?? null);
  const early = useEarlyAlert(tripId, day?.next ?? null, dayStops);
  const rain = useRainAlert(tripId, day?.now ?? null, day?.next ?? null);
  const spend = useSpendCheck(tripId, dayStops, plan.members.length);
  // Running early (screen 8): the navy block shows the stop they just left, Next the one they're heading to.
  // Spend check (screen 9) the same, for the stop it asks about, unless a running-late card is up.
  const leftStop = day && !day.now
    ? early.alert
      ? (dayStops.find((s) => s.id === early.alert!.left_stop_id) ?? null)
      : !late.alert
        ? spend.stop
        : null
    : null;
  // Otherwise, between stops the navy block shows where they're heading, so Next is the one after it.
  const heading = day && !day.now && !leftStop ? day.next : null;
  const upNext = day ? (day.now || leftStop ? day.next : day.after) : null;
  const weather = useWeather(tripId, day?.now ?? leftStop ?? heading, upNext);

  /** "We're done here": the stop is finished now, without waiting for the 3 minutes away. */
  const doneHere = useCallback(
    async (stop: Stop) => {
      setLeaving(true);
      try {
        await save([
          {
            stopId: stop.id,
            from: 'arrived',
            status: 'done',
            arrived_at: stop.arrived_at,
            left_at: clockNow().toISOString(),
          },
        ]);
      } finally {
        setLeaving(false);
      }
    },
    [save],
  );

  return {
    tripId,
    trip,
    view,
    heading,
    leftStop,
    upNext,
    weather,
    late,
    early,
    rain,
    spend,
    time,
    members: plan.members,
    loading: plan.loading,
    error: plan.error,
    refetch: plan.refetch,
    location,
    /** Location access to ask for (never in Demo mode, which needs no GPS). */
    needsPermission: !demo && permission != null && permission !== 'granted' ? permission : null,
    allowLocation,
    doneHere,
    leaving,
  };
}
