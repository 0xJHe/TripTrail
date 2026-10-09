import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { planningKeys } from '@/features/planning/hooks/usePlanning';
import type { Stop } from '@/features/planning/types';
import { now, useNow } from '@/lib/clock';
import { getGroupLocation } from '@/lib/location';
import type { RainOption } from '@/supabase/functions/_shared/nearby';
import { decideRain } from '../api';
import { openRainFor, rainLeft, swapTimes } from '../rain';
import { rainKeys, useRainAlerts } from './useRainCheck';

/** The rain card for the stop the group is at (or the next one), and its buttons. */
export function useRainAlert(tripId: string | undefined, current: Stop | null, next: Stop | null) {
  const queryClient = useQueryClient();
  const alerts = useRainAlerts(tripId);
  const open = openRainFor(alerts.data ?? [], current, next);
  const time = useNow().getTime();
  /** The place id being swapped in, or 'keep'. */
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopId = open?.alert.stop_id;
  const stop = open?.stop ?? null;

  const run = useCallback(
    async (kind: string, act: () => Promise<unknown>) => {
      if (!stopId || !tripId) return;
      setDeciding(kind);
      setError(null);
      try {
        await act();
      } catch (e) {
        console.warn('Saving the rain choice failed:', e instanceof Error ? e.message : e);
        setError(stopId);
      } finally {
        setDeciding(null);
        queryClient.invalidateQueries({ queryKey: rainKeys.alerts(tripId) });
        queryClient.invalidateQueries({ queryKey: planningKeys.stops(tripId) });
      }
    },
    [stopId, tripId, queryClient],
  );

  /** "Go": the place takes the outdoor stop's time slot, for everyone. */
  const go = (option: RainOption) =>
    run(option.placeId, async () => {
      if (!stop) return;
      const at = now().getTime();
      const here = (await getGroupLocation())?.center ?? (stop.lat != null && stop.lng != null ? { lat: stop.lat, lng: stop.lng } : option);
      await decideRain(stopId!, 'go', { placeId: option.placeId, ...swapTimes({ stop, option, here, now: at }) });
    });

  /** "Keep plan": close the card for everyone. */
  const keep = () => run('keep', () => decideRain(stopId!, 'keep'));

  return {
    alert: open?.alert ?? null,
    /** The outdoor stop the card is for. */
    stop,
    /** Minutes until the rain, counting down. */
    minutes: open ? rainLeft(open.alert, time) : 0,
    /** Shown under the card when saving failed. */
    note: error && error === stopId ? "Couldn't save that. Check the connection and try again." : null,
    go,
    keep,
    deciding,
  };
}

export type RainState = ReturnType<typeof useRainAlert>;
