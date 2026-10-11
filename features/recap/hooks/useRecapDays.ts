import { useMemo } from 'react';

import { useStops } from '@/features/planning/hooks/usePlanning';
import { sortStops } from '@/features/planning/stops';
import { useNow } from '@/lib/clock';
import { dayFinished, recapDays } from '../dayEnd';
import { useDayClosures } from './useDayClosures';
import { useOpenDay } from './useOpenDay';

/** Trip days with a day recap (Plan tab): the days before the open one, and today once finished or closed. */
export function useRecapDays(tripId: string | undefined, days: number): Set<number> {
  const openDay = useOpenDay(tripId).day;
  const stops = useStops(tripId);
  const closures = useDayClosures(tripId, openDay);
  const time = useNow().getTime();
  const todayStops = useMemo(() => sortStops(stops.data ?? []).filter((s) => s.day_number === openDay), [stops.data, openDay]);
  const openDayDone = closures.mine || dayFinished(todayStops, time);
  return useMemo(() => new Set(recapDays({ days, openDay, openDayDone })), [days, openDay, openDayDone]);
}
