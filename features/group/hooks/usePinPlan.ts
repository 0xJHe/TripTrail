import { router } from 'expo-router';
import { useMemo } from 'react';

import { useDayPlan } from '@/features/planning/hooks/useDayPlan';
import { useFinishedDays } from '@/features/recap/hooks/useFinishedDays';
import { pinInPlan, pinStopRoute } from '../pins';
import type { Pin } from '../types';

/**
 * A pin's "Add to plan" (Pin spot list and the map's pin card): opens the normal Add a stop
 * screen for today's trip day, filled with the pin's name and location, so the person picks the
 * times (and gets the overlap check). Never a day finished for me: after closing a day kept open
 * past midnight, the calendar day; planDay null when no trip day is open (no button).
 */
export function usePinPlan(tripId: string | undefined) {
  const plan = useDayPlan(tripId);
  const planDay = useFinishedDays(tripId, plan.days).addDay;
  const dayStops = useMemo(() => plan.stops.filter((s) => s.day_number === planDay), [plan.stops, planDay]);
  return {
    planDay,
    dayStops,
    /** Already a stop on that day: "In plan". */
    inPlan: (pin: Pin) => pinInPlan(pin, dayStops),
    add: (pin: Pin) => {
      if (tripId && planDay != null) router.push(pinStopRoute(tripId, pin.id, planDay));
    },
  };
}
