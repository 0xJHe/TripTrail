import { useEffect, useMemo, useState } from 'react';

import { useDemo } from './demo';

const MINUTE = 60_000;

/**
 * The current time. Live-trip features must use this, never `new Date()` / `Date.now()`.
 * Real time normally; in Demo mode the fake time set from the debug bar.
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

/** Demo mode: set the fake time. `anchor` is the trip it was set for. */
export function setFakeTime(ms: number, anchor?: string | null) {
  useDemo.setState(anchor === undefined ? { fakeTime: ms } : { fakeTime: ms, anchor });
}

/** Demo mode: move the fake time forward (e.g. the "+15 min" button). */
export function advanceFakeTime(minutes: number) {
  setFakeTime(now().getTime() + minutes * MINUTE);
}

/** Demo mode: start the replay again from the top of Day 1 (features/demo sets the time). */
export function resetFakeTime() {
  useDemo.setState({ fakeTime: Date.now(), anchor: null });
}
