import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Demo mode, shared per trip: the open trip's `demo_sessions` row (Supabase), mirrored here
 * by features/demo (useDemoSession) and kept live with Realtime, so every member's phone has
 * the same on/off, fake clock and day. Read it through lib/clock.ts and lib/location.ts, not
 * directly in features. Saved on the phone too, so the background location task knows
 * Demo mode is on when it wakes the app with no screen open.
 */
export interface DemoSession {
  enabled: boolean;
  /** The fake time (ms). null = not set yet; now() then uses the real time. */
  fakeTime: number | null;
  /** The trip day being replayed (as last saved; the replay works it out from the fake time). */
  day: number | null;
  /** The last demo event reached (fake time, ms), null = none. */
  eventAt: number | null;
  /** Day 1's replay start (Reset goes back there). */
  startTime: number | null;
  /** +1 on every change; a tap is only applied if it saw the latest step. */
  step: number;
  /** When the trip's demo was last Reset (real time ISO), null = never. */
  resetAt: string | null;
}

interface DemoState extends DemoSession {
  /** Trip this state belongs to (the open trip). */
  tripId: string | null;
}

export const DEMO_OFF: DemoSession = {
  enabled: false,
  fakeTime: null,
  day: null,
  eventAt: null,
  startTime: null,
  step: 0,
  resetAt: null,
};

export const useDemo = create<DemoState>()(
  persist((): DemoState => ({ ...DEMO_OFF, tripId: null }), {
    name: 'triptrail-demo-shared',
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

/** Mirror the trip's shared demo (features/demo calls this with each row it reads). */
export function setDemoSession(tripId: string | null, session: DemoSession) {
  useDemo.setState({ ...session, tripId });
}

export const isDemoMode = () => useDemo.getState().enabled;
