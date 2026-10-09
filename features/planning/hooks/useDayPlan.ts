import { useMemo } from 'react';

import { budgetSummary, groupBudget } from '@/features/money/budget';
import { useSpends } from '@/features/money/hooks/useSpends';
import { useMembers, useTrip } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { answered } from '../optionFit';
import { dayCount, planStart, sortStops } from '../stops';
import { useOptions, usePreferences, useStops } from './usePlanning';

/** Everything the Day plan needs, kept live with Realtime. */
export function useDayPlan(tripId: string | undefined) {
  const trip = useTrip(tripId);
  const members = useMembers(tripId);
  const prefs = usePreferences(tripId);
  const options = useOptions(tripId);
  const stops = useStops(tripId);
  // This person's spend-check answers: confirmed amounts replace the estimates (live).
  const { mine } = useSpends(tripId);
  useTripRealtime(tripId, ['trips', 'members', 'preferences', 'stops']);

  const option = options.data?.find((o) => o.id === trip.data?.winning_option_id) ?? null;
  const tripDays = option?.plan_json.days ?? trip.data?.length_days ?? null;
  const sorted = useMemo(() => sortStops(stops.data ?? []), [stops.data]);
  const days = dayCount(sorted, tripDays);
  const start = planStart(trip.data?.start_date ?? null, sorted);
  const budget = useMemo(
    () => budgetSummary(sorted, groupBudget(answered(prefs.data ?? []), days), mine),
    [sorted, prefs.data, days, mine],
  );

  return {
    trip: trip.data,
    members: members.data ?? [],
    stops: sorted,
    days,
    start,
    budget,
    loading: trip.isLoading || stops.isLoading,
    error: trip.error || stops.error,
    refetch: stops.refetch,
  };
}
