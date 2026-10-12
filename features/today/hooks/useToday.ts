import { useCallback, useMemo, useState } from 'react';

import { useSpendCheck } from '@/features/money/hooks/useSpends';
import { useDayPlan } from '@/features/planning/hooks/useDayPlan';
import type { Stop } from '@/features/planning/types';
import { useDayEnd } from '@/features/recap/hooks/useDayEnd';
import { useOpenDay } from '@/features/recap/hooks/useOpenDay';
import { useCurrentTrip } from '@/features/trip/store';
import { now as clockNow, useNow } from '@/lib/clock';
import { useDemoRoute, useGroupLocation } from '@/lib/location';
import { useLocationAccess } from '../permission';
import { justLeftStop, todayView } from '../todayPlan';
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
  // After "Keep going" the day stays open past midnight, until Done for today.
  const openDay = useOpenDay(tripId).day;
  const [leaving, setLeaving] = useState(false);

  const { trip, stops, days, start } = plan;
  const view = useMemo(
    () => (trip ? todayView({ stage: trip.stage, start, days, stops, now: time, day: openDay }) : null),
    [trip, start, days, stops, time, openDay],
  );
  const day = view?.kind === 'day' ? view : null;
  const dayStops = useMemo(() => (day ? stops.filter((s) => s.day_number === day.day) : []), [stops, day?.day]);
  const tomorrow = useMemo(
    () => (day && day.day < days ? stops.filter((s) => s.day_number === day.day + 1) : null),
    [stops, days, day?.day],
  );
  // The end of the day: "That's every stop for today", Keep going, Day closed (prototype screen 14).
  const dayEnd = useDayEnd(tripId, day?.day ?? 0, dayStops, tomorrow);
  const late = useLateAlert(tripId, day?.next ?? null);
  const early = useEarlyAlert(tripId, day?.next ?? null, dayStops);
  const rain = useRainAlert(tripId, day?.now ?? null, day?.next ?? null);
  const spend = useSpendCheck(tripId, dayStops, plan.members.length);
  // After leaving a stop the navy block says "Just left [stop]" (screens 8, 9), Next the one they're
  // heading to, until the spend check and any running-early / late card are answered.
  const leftStop = day
    ? justLeftStop({
        dayStops,
        now: time.getTime(),
        atStop: day.now != null,
        spendStop: spend.stop,
        earlyLeftId: early.alert ? early.alert.left_stop_id : undefined,
        late: late.alert != null,
      })
    : null;
  // Then, until they arrive, "On the way to [next stop]" (with Directions), so Next is the one after it.
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
    dayEnd,
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
    /** Google Maps directions to a stop: walking under ~2 km, else driving (opens the app, no API call). */
  };
}
