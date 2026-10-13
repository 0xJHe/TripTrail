import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { useDemo } from '@/lib/demo';
import { removePinPhotos, resetDemo } from '../api';
import { applyDemoSession } from './useDemoSession';

/**
 * The debug bar's Reset, once for the whole trip: the demo_reset function undoes everything
 * made at or after the fake start time (`since`, Day 1's replay start): rain, running-early
 * and running-late cards, visits, spend answers and extra spends, Done for today, meet points
 * and splits, pins; then puts the shared clock back to the start. This phone then removes the
 * removed pins' photos; every phone forgets its own Keep going taps and refetches when it
 * sees the reset (applyDemoSession). Two Resets at once = one (same step rule as the other
 * buttons).
 */
export function useDemoReset(tripId: string | undefined, since: number | null) {
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const reset = async () => {
    if (!tripId || running.current) return;
    running.current = true;
    setResetting(true);
    setError(null);
    try {
      const out = await resetDemo(tripId, useDemo.getState().step, since);
      applyDemoSession(tripId, out.session, queryClient);
      await removePinPhotos(out.photos).catch((e) =>
        console.warn("Demo reset couldn't remove the demo pins' photos:", e instanceof Error ? e.message : e),
      );
    } catch (e) {
      console.warn('Demo reset failed:', e instanceof Error ? e.message : e);
      setError("Couldn't reset the demo. Check the connection and try again.");
    } finally {
      running.current = false;
      setResetting(false);
    }
  };

  return { reset, resetting, error };
}
