import { router } from 'expo-router';
import { useMemo } from 'react';

import { useSpends } from '@/features/money/hooks/useSpends';
import { useDayPlan } from '@/features/planning/hooks/useDayPlan';
import { useStops } from '@/features/planning/hooks/usePlanning';
import { dayDate } from '@/features/planning/stops';
import { useCurrentTrip } from '@/features/trip/store';
import { dayReview, sharingBackAt } from '../dayEnd';
import { useDayClosures } from './useDayClosures';
import { useOpenDay } from './useOpenDay';

/** Everything the Done for today screen shows (prototype screen 14). No Google or Gemini calls. */
export function useDoneToday() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const plan = useDayPlan(tripId);
  // Every stop, dropped ones too: "How today went" crosses them out.
  const allStops = useStops(tripId);
  const { mine } = useSpends(tripId);
  // Kept open past midnight after "Keep going": still that day.
  const day = useOpenDay(tripId).day;
  const closures = useDayClosures(tripId, day);
  const isTripDay = day >= 1 && day <= plan.days;

  const review = useMemo(
    () => dayReview((allStops.data ?? []).filter((s) => s.day_number === day), mine),
    [allStops.data, day, mine],
  );
  const tomorrow = useMemo(
    () => (isTripDay && day < plan.days ? plan.stops.filter((s) => s.day_number === day + 1) : null),
    [plan.stops, plan.days, day, isTripDay],
  );

  const openStop = (stopId: string) => {
    if (!tripId) return;
    router.push({ pathname: '/trip/[id]/stop/[stopId]', params: { id: tripId, stopId, day: String(day + 1) } });
  };

  /** Close the day for this person, then back to the Today tab ("Day closed"). */
  const done = async () => {
    if (!(await closures.close())) return;
    if (router.canGoBack()) router.back();
    else router.replace('/today');
  };

  return {
    tripId,
    trip: plan.trip,
    loading: plan.loading || allStops.isLoading,
    day,
    isTripDay,
    date: isTripDay ? dayDate(plan.start, day) : null,
    tomorrowDate: tomorrow ? dayDate(plan.start, day + 1) : null,
    review,
    tomorrow,
    backAt: tomorrow ? sharingBackAt(tomorrow) : null,
    members: plan.members,
    closed: closures.closed,
    editStop: openStop,
    addStop: () => openStop('new'),
    done,
    saving: closures.saving,
    error: closures.error,
  };
}
