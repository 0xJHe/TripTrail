import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { now, useNow } from '@/lib/clock';
import { addMeetPoint, endMeetPoint, fetchMeetPoints } from '../api';
import { currentGathering } from '../meetPoint';
import type { NewMeetPoint } from '../types';

export const meetKeys = { all: (tripId: string) => ['meetPoints', tripId] as const };

/** The trip's current meet point and split (live through Realtime), and the calls to change them. */
export function useMeetPoints(tripId: string | undefined, meId: string | null = null) {
  const queryClient = useQueryClient();
  const time = useNow();
  const query = useQuery({
    queryKey: meetKeys.all(tripId ?? ''),
    queryFn: () => fetchMeetPoints(tripId!),
    enabled: !!tripId,
  });
  useTripRealtime(tripId, ['meet_points']);

  const t = time.getTime();
  const rows = query.data;
  const meet = useMemo(() => currentGathering(rows ?? [], 'meet', t), [rows, t]);
  const split = useMemo(() => currentGathering(rows ?? [], 'split', t), [rows, t]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: meetKeys.all(tripId ?? '') });
  const add = async (row: Omit<NewMeetPoint, 'set_at'>) => {
    if (!tripId) return;
    await addMeetPoint(tripId, meId, { ...row, set_at: now().toISOString() });
    await refresh();
  };
  const end = async (id: string, status: 'together' | 'cleared') => {
    await endMeetPoint(id, status, now().toISOString(), meId);
    await refresh();
  };

  return { meet, split, time, loading: query.isLoading, add, end };
}
