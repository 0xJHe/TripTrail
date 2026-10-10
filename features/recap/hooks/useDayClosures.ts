import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { useMyMember } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { now, useNow } from '@/lib/clock';
import { fetchDayClosures, saveDayClosure } from '../api';
import { closedIds } from '../dayEnd';
import type { DayClosure } from '../types';

export const closureKeys = {
  closures: (tripId: string) => ['dayClosures', tripId] as const,
};

/**
 * Who has closed a trip day ("2 of 4 have closed their day"), live with Realtime, and this
 * person's Done for today / reopen. Closures after the fake time don't count (Demo mode Reset).
 */
export function useDayClosures(tripId: string | undefined, day: number) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: closureKeys.closures(tripId ?? ''),
    queryFn: () => fetchDayClosures(tripId!),
    enabled: !!tripId,
  });
  useTripRealtime(tripId, ['day_closures']);
  const me = useMyMember(tripId);
  const time = useNow().getTime();
  const closed = useMemo(() => closedIds(query.data ?? [], day, time), [query.data, day, time]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (isClosed: boolean): Promise<boolean> => {
      if (!tripId || !me || day < 1) return false;
      const key = closureKeys.closures(tripId);
      const row: DayClosure = { trip_id: tripId, member_id: me.id, day_number: day, closed: isClosed, closed_at: now().toISOString() };
      setSaving(true);
      setError(null);
      // Show it straight away (location sharing stops on this phone at once).
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<DayClosure[]>(key, (old = []) => [
        ...old.filter((r) => !(r.member_id === row.member_id && r.day_number === row.day_number)),
        row,
      ]);
      try {
        await saveDayClosure(row);
        return true;
      } catch (e) {
        console.warn('Saving Done for today failed:', e instanceof Error ? e.message : e);
        setError("Couldn't save that. Check the connection and try again.");
        return false;
      } finally {
        setSaving(false);
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [tripId, me, day, queryClient],
  );

  return {
    /** Members who closed this day. */
    closed,
    /** This person closed this day. */
    mine: !!me && closed.has(me.id),
    ready: query.isSuccess || !tripId,
    close: () => save(true),
    reopen: () => save(false),
    saving,
    error,
  };
}
