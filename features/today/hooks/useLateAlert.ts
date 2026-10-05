import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { planningKeys } from '@/features/planning/hooks/usePlanning';
import type { Stop } from '@/features/planning/types';
import { decideNewDay } from '../api';
import { openAlertFor } from '../late';
import { lateKeys, useLateAlerts } from './useLateCheck';

/** The running-late card for the stop the group is heading to, and its buttons. */
export function useLateAlert(tripId: string | undefined, next: Stop | null) {
  const queryClient = useQueryClient();
  const alerts = useLateAlerts(tripId);
  const alert = openAlertFor(alerts.data ?? [], next);
  const [deciding, setDeciding] = useState<'accept' | 'keep' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopId = alert?.stop_id;

  /** Accept the suggested new day, or keep the original. Closes the card for the whole group. */
  const decide = useCallback(
    async (choice: 'rules' | 'keep') => {
      if (!stopId || !tripId) return;
      setDeciding(choice === 'keep' ? 'keep' : 'accept');
      setError(null);
      try {
        await decideNewDay(stopId, choice);
      } catch (e) {
        console.warn('Saving the new day failed:', e instanceof Error ? e.message : e);
        setError(stopId);
      } finally {
        setDeciding(null);
        queryClient.invalidateQueries({ queryKey: lateKeys.alerts(tripId) });
        queryClient.invalidateQueries({ queryKey: planningKeys.stops(tripId) });
      }
    },
    [stopId, tripId, queryClient],
  );

  return {
    alert,
    plan: alert?.plan ?? null,
    /** Shown under the buttons when saving failed. */
    note: error && error === stopId ? "Couldn't save that. Check the connection and try again." : null,
    accept: () => decide('rules'),
    keep: () => decide('keep'),
    deciding,
  };
}

export type LateState = ReturnType<typeof useLateAlert>;
