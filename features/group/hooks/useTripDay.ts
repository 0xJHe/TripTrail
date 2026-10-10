import { useMemo } from 'react';

import { useStops } from '@/features/planning/hooks/usePlanning';
import { sortStops } from '@/features/planning/stops';
import { keptGoingWindow } from '@/features/recap/dayEnd';
import { useOpenDay } from '@/features/recap/hooks/useOpenDay';
import { useTrip } from '@/features/trip/hooks/useTrip';
import { useNow } from '@/lib/clock';
import { inWindow, sharingWindow } from '../groupMap';

/**
 * Today's trip day (0 = not a trip day; kept open past midnight after "Keep going"), its stops,
 * and whether phones share their position now. After Keep going the window runs until the day
 * ends by itself, 1 hour before the next day's first stop (useOpenDay), unless Done for today.
 * ready = the trip and its stops have loaded (until then `sharing` is false only because nothing is known).
 */
export function useTripDay(tripId: string | undefined) {
  const trip = useTrip(tripId);
  const stops = useStops(tripId);
  const time = useNow();
  const sorted = useMemo(() => sortStops(stops.data ?? []), [stops.data]);
  const open = useOpenDay(tripId);
  const day = open.day;
  const dayStops = useMemo(
    () => sorted.filter((s) => s.day_number === day && s.status !== 'dropped'),
    [sorted, day],
  );
  const window = useMemo(
    () => keptGoingWindow(sharingWindow(dayStops), open.keptGoing, open.endsAt),
    [dayStops, open.keptGoing, open.endsAt],
  );
  return {
    trip: trip.data,
    allStops: sorted,
    day,
    dayStops,
    window,
    sharing: inWindow(window, time.getTime()),
    time,
    ready: !tripId || (trip.isSuccess && stops.isSuccess && open.ready),
  };
}
