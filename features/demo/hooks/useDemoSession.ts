import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useKeepGoing } from '@/features/recap/keepGoing';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { useCurrentTrip } from '@/features/trip/store';
import { DEMO_OFF, setDemoSession, useDemo, type DemoSession } from '@/lib/demo';
import { fetchDemoSession } from '../api';
import { isNewer, isNewReset } from '../session';

export const demoKeys = {
  session: (tripId: string) => ['demoSession', tripId] as const,
  batteries: (tripId: string) => ['demoBatteries', tripId] as const,
};

/**
 * Put a copy of the trip's shared demo on this phone (lib/demo), unless it is older than the
 * one already here. After someone's Reset: forget this person's Keep going taps from the demo
 * (saved on the phone) and refetch everything, since Realtime can't send the deleted rows.
 */
export function applyDemoSession(tripId: string, session: DemoSession, queryClient: QueryClient) {
  const current = useDemo.getState();
  if (!isNewer(current, tripId, session)) return;
  const reset = isNewReset(current, tripId, session);
  setDemoSession(tripId, session);
  queryClient.setQueryData(demoKeys.session(tripId), session);
  if (reset) {
    if (session.startTime != null) useKeepGoing.getState().forgetSince(tripId, session.startTime);
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'demoSession' });
  }
}

/**
 * Keeps lib/demo in step with the open trip's `demo_sessions` row, live with Realtime, so
 * every member's phone has the same Demo mode on/off, fake clock and day. Mounted once at
 * the app root (DemoFrame). No trip open = Demo mode off.
 */
export function useDemoSession() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: demoKeys.session(tripId ?? ''),
    queryFn: () => fetchDemoSession(tripId!),
    enabled: !!tripId,
  });
  useTripRealtime(tripId, ['demo_sessions']);

  useEffect(() => {
    if (!tripId) {
      setDemoSession(null, DEMO_OFF);
      return;
    }
    // Until this trip's row has loaded: off, unless the copy saved on the phone is this trip's.
    if (!query.data) {
      if (useDemo.getState().tripId !== tripId) setDemoSession(tripId, DEMO_OFF);
      return;
    }
    applyDemoSession(tripId, query.data, queryClient);
  }, [tripId, query.data, queryClient]);
}
