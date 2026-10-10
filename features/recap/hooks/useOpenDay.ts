import { useMemo } from 'react';

import { useStops } from '@/features/planning/hooks/usePlanning';
import { dayDate, planStart, sortStops } from '@/features/planning/stops';
import { tripDayOn } from '@/features/today/todayPlan';
import { useTrip } from '@/features/trip/hooks/useTrip';
import { useNow } from '@/lib/clock';
import { activeTripDay, openDayEndsAt } from '../dayEnd';
import { keptGoing, useKeepGoing } from '../keepGoing';

/**
 * The trip day this person is on (0 = not a trip day). Normally today's date; after "Keep
 * going" the day carries on past midnight until 1 hour before the next day's first stop
 * (closing it with Done for today turns sharing off; the Today tab then says "Day closed").
 * Every live-trip feature that asks "which day is it" uses this.
 */
export function useOpenDay(tripId: string | undefined) {
  const trip = useTrip(tripId);
  const stops = useStops(tripId);
  const time = useNow();
  const t = time.getTime();
  const tapped = useKeepGoing((s) => s.at);
  const sorted = useMemo(() => sortStops(stops.data ?? []), [stops.data]);
  const start = planStart(trip.data?.start_date ?? null, sorted);
  const decided = trip.data?.stage === 'decided';
  const calendarDay = decided ? tripDayOn(start, time) : 0;

  /** When day d, kept open, ends by itself. */
  const endsAtOf = (d: number) => openDayEndsAt(sorted.filter((s) => s.day_number === d + 1), dayDate(start, d + 1));
  const day = decided
    ? activeTripDay({
        calendarDay,
        prevKeptGoing: keptGoing(tapped, tripId, calendarDay - 1, t),
        prevEndsAt: endsAtOf(calendarDay - 1),
        t,
      })
    : 0;

  return {
    day,
    /** Kept open from the day before, past midnight. */
    pastMidnight: day > 0 && day < calendarDay,
    /** "Keep going" was tapped for this day. */
    keptGoing: day > 0 && keptGoing(tapped, tripId, day, t),
    /** When this day ends by itself if kept open (ms). */
    endsAt: endsAtOf(day),
    start,
    ready: !tripId || (trip.isSuccess && stops.isSuccess),
  };
}
