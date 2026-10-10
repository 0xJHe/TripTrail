import { useMemo } from 'react';

import { useStops } from '@/features/planning/hooks/usePlanning';
import { planStart, sortStops } from '@/features/planning/stops';
import { tripDayOn } from '@/features/today/todayPlan';
import { useTrip } from '@/features/trip/hooks/useTrip';
import { useNow } from '@/lib/clock';
import { inWindow, sharingWindow } from '../groupMap';

/**
 * Today's trip day (0 = not a trip day), its stops, and whether phones share their position now.
 * ready = the trip and its stops have loaded (until then `sharing` is false only because nothing is known).
 */
export function useTripDay(tripId: string | undefined) {
  const trip = useTrip(tripId);
  const stops = useStops(tripId);
  const time = useNow();
  const sorted = useMemo(() => sortStops(stops.data ?? []), [stops.data]);
  const start = planStart(trip.data?.start_date ?? null, sorted);
  const day = trip.data?.stage === 'decided' ? tripDayOn(start, time) : 0;
  const dayStops = useMemo(
    () => sorted.filter((s) => s.day_number === day && s.status !== 'dropped'),
    [sorted, day],
  );
  const window = useMemo(() => sharingWindow(dayStops), [dayStops]);
  return {
    trip: trip.data,
    allStops: sorted,
    day,
    dayStops,
    window,
    sharing: inWindow(window, time.getTime()),
    time,
    ready: !tripId || (trip.isSuccess && stops.isSuccess),
  };
}
