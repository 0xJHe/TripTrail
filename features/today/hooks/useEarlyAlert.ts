import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { planningKeys } from '@/features/planning/hooks/usePlanning';
import type { Stop } from '@/features/planning/types';
import { now, useNow } from '@/lib/clock';
import { getGroupLocation, useGroupLocation } from '@/lib/location';
import { decideEarly } from '../api';
import { fillStop, moveEarlier, openEarlyFor, spareNow } from '../early';
import { checkable } from '../late';
import { earlyKeys, useEarlyAlerts } from './useEarlyCheck';
import { useLateAlerts } from './useLateCheck';

type Deciding = 'add' | 'next' | 'move' | 'keep';

/** The running-early card for the stop the group is heading to, and its buttons. */
export function useEarlyAlert(tripId: string | undefined, next: Stop | null, dayStops: Stop[]) {
  const queryClient = useQueryClient();
  const early = useEarlyAlerts(tripId);
  const late = useLateAlerts(tripId);
  const alert = openEarlyFor(early.data ?? [], late.data ?? [], next);
  const location = useGroupLocation();
  const time = useNow().getTime();
  const [deciding, setDeciding] = useState<Deciding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopId = alert?.stop_id;

  // What "Go to next stop" would offer: the next stop moved earlier by the spare time now.
  const spare = alert && next ? spareNow(alert, next, location?.center ?? null, time) : 0;
  const move = alert && next ? moveEarlier(next, spare) : null;

  const run = useCallback(
    async (kind: Deciding, act: () => Promise<unknown>) => {
      if (!stopId || !tripId) return;
      setDeciding(kind);
      setError(null);
      try {
        await act();
      } catch (e) {
        console.warn('Saving the running-early choice failed:', e instanceof Error ? e.message : e);
        setError(stopId);
      } finally {
        setDeciding(null);
        queryClient.invalidateQueries({ queryKey: earlyKeys.alerts(tripId) });
        queryClient.invalidateQueries({ queryKey: planningKeys.stops(tripId) });
      }
    },
    [stopId, tripId, queryClient],
  );

  /** Where the group is right now, for times worked out on the tap. */
  const here = async () => (await getGroupLocation())?.center ?? location?.center ?? null;

  /** "Add this": the suggestion becomes a stop now, before the next one. */
  const add = () =>
    run('add', async () => {
      const suggestion = alert?.suggestion;
      const at = now().getTime();
      const from = (await here()) ?? suggestion ?? null;
      if (!suggestion || !checkable(next) || !from) throw new Error('Nothing to add');
      const { stop, times } = fillStop({ suggestion, next, dayStops, here: from, now: at });
      await decideEarly(stopId!, 'add', { add: stop, times });
    });

  /** "Go to next stop": ask whether to move the next stop earlier, or just close the card if it can't move. */
  const goNext = () => run('next', () => decideEarly(stopId!, move ? 'offer' : 'keep'));

  /** Move the next stop earlier by the spare time (worked out again on the tap). */
  const acceptMove = () =>
    run('move', async () => {
      if (!alert || !next) return;
      const moved = moveEarlier(next, spareNow(alert, next, await here(), now().getTime()));
      await (moved ? decideEarly(stopId!, 'move', { times: [moved] }) : decideEarly(stopId!, 'keep'));
    });

  const keep = () => run('keep', () => decideEarly(stopId!, 'keep'));

  return {
    alert,
    /** The next stop's new start if moved now (for "Move to 13:25"), or null. */
    move,
    /** Shown under the buttons when saving failed. */
    note: error && error === stopId ? "Couldn't save that. Check the connection and try again." : null,
    add,
    goNext,
    acceptMove,
    keep,
    deciding,
  };
}

export type EarlyState = ReturnType<typeof useEarlyAlert>;
