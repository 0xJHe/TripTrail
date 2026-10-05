import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { planningKeys } from '@/features/planning/hooks/usePlanning';
import type { Stop } from '@/features/planning/types';
import { saveVisit } from '../api';
import { applyChanges } from '../arrival';
import type { VisitChange } from '../types';

/** Show visit changes at once on this phone, then save them; Realtime brings them to everyone else. */
export function useSaveVisits(tripId: string | undefined) {
  const queryClient = useQueryClient();
  return useCallback(
    async (changes: VisitChange[]) => {
      if (!tripId || changes.length === 0) return;
      const key = planningKeys.stops(tripId);
      queryClient.setQueryData<Stop[]>(key, (old) => (old ? applyChanges(old, changes) : old));
      try {
        await Promise.all(changes.map(saveVisit));
      } catch (e) {
        console.warn('Saving arrive / leave times failed:', e instanceof Error ? e.message : e);
      } finally {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [tripId, queryClient],
  );
}
