import { useCallback, useMemo, useState } from 'react';

import { useDayPlan } from '@/features/planning/hooks/useDayPlan';
import type { Stop } from '@/features/planning/types';
import { useCurrentTrip } from '@/features/trip/store';
import { now as clockNow, useNow } from '@/lib/clock';
import { useDemoRoute, useGroupLocation } from '@/lib/location';
import { useLocationAccess } from '../permission';
import { todayView } from '../todayPlan';
import { useSaveVisits } from './useSaveVisits';

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
