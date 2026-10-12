import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';

import type { Stop } from '@/features/planning/types';
import { now, useNow } from '@/lib/clock';
import { dayEndMode, dayFinished, sharingBackAt, visitedBy } from '../dayEnd';
import { keptGoing, useKeepGoing } from '../keepGoing';
import { useDayClosures } from './useDayClosures';

/**
 * The end of the day on the Today tab: "That's every stop for today" (Done for today / Keep
 * going) once the last stop is finished, the pinned buttons after Keep going, and "Day closed"
 * after Done for today. `dayStops` = today's stops still in the plan, in order;
 * `tomorrow` = the next day's (null on the trip's last day).
 */
export function useDayEnd(tripId: string | undefined, day: number, dayStops: Stop[], tomorrow: Stop[] | null) {
  const time = useNow().getTime();
  const tapped = useKeepGoing((s) => s.at);
  const closures = useDayClosures(tripId, day);
  const finished = dayFinished(dayStops, time);
  const mode = closures.ready
    ? dayEndMode({ finished, keptGoing: keptGoing(tapped, tripId, day, time), closed: closures.mine })
    : 'hidden';

  const keepGoing = useCallback(() => {
    if (tripId) useKeepGoing.getState().keepGoing(tripId, day, now().getTime());
  }, [tripId, day]);
  const addStop = useCallback(() => {
    if (!tripId) return;
    router.push({ pathname: '/trip/[id]/stop/[stopId]', params: { id: tripId, stopId: 'new', day: String(day) } });
  }, [tripId, day]);

  return {
    mode,
    // Visits after the (fake) time don't count yet.
    visited: dayStops.filter((s) => visitedBy(s, time)).length,
    total: dayStops.length,
    /** "07:00": sharing comes back on 60 min before tomorrow's first stop; null on the last day. */
    backAt: useMemo(() => (tomorrow ? sharingBackAt(tomorrow) : null), [tomorrow]),
    lastDay: tomorrow == null,
    openDone: () => router.push('/done-today'),
    keepGoing,
    addStop,
    saving: closures.saving,
    error: closures.error,
  };
}

export type DayEndState = ReturnType<typeof useDayEnd>;
