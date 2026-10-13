import { useEffect, useMemo, useState } from 'react';

import { useDemo } from './demo';

/**
 * The current time. Live-trip features must use this, never `new Date()` / `Date.now()`.
 * Real time normally; in Demo mode the trip's shared fake time (lib/demo.ts, the same on
 * every member's phone; the debug bar moves it for everyone).
 */
export function now(): Date {
  const { enabled, fakeTime } = useDemo.getState();
  return new Date(enabled && fakeTime != null ? fakeTime : Date.now());
}

/** now() as a hook: re-renders when the fake time moves, or every `tickMs` on the real clock. */
export function useNow(tickMs = 30_000): Date {
  const enabled = useDemo((s) => s.enabled);
  const fakeTime = useDemo((s) => s.fakeTime);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), tickMs);
    return () => clearInterval(id);
  }, [enabled, tickMs]);
  return useMemo(() => now(), [enabled, fakeTime, tick]);
}
