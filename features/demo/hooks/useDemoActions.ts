import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { useDemo, type DemoSession } from '@/lib/demo';
import { setDemoEnabled, stepDemo } from '../api';
import { demoReason } from '../errors';
import { applyDemoSession } from './useDemoSession';

/**
 * Changes to the trip's shared demo: Demo mode on/off, and the debug bar's +15 min / Next
 * event / Next day. Each tap carries the step this phone last saw, so if someone else
 * tapped at the same moment only one of them happens; either way the state that won comes
 * back and is shown. One tap at a time per phone.
 */
export function useDemoActions(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (change: (trip: string) => Promise<DemoSession>, failed: string) => {
      if (!tripId || running.current) return;
      running.current = true;
      setBusy(true);
      setError(null);
      try {
        applyDemoSession(tripId, await change(tripId), queryClient);
      } catch (e) {
        console.warn('Updating the demo failed:', e instanceof Error ? e.message : e);
        setError(`${failed} ${demoReason(e)}`);
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [tripId, queryClient],
  );

  const setEnabled = useCallback(
    (on: boolean) => run((trip) => setDemoEnabled(trip, on), `Couldn't turn Demo mode ${on ? 'on' : 'off'}.`),
    [run],
  );
  const step = useCallback(
    (move: { fakeTime: number; day: number | null; eventAt: number | null }) =>
      run((trip) => stepDemo(trip, useDemo.getState().step, move), "Couldn't move the demo on."),
    [run],
  );

  return { setEnabled, step, busy, error, setError };
}
