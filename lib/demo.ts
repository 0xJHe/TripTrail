import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Demo mode (Settings). Read it through lib/clock.ts and lib/location.ts, not directly in features. */
interface DemoState {
  enabled: boolean;
  /** The fake time (ms). null = not set yet; now() then uses the real time. */
  fakeTime: number | null;
  /** Trip the fake time was set for. When another trip is opened, the replay starts over. */
  anchor: string | null;
  setEnabled: (on: boolean) => void;
}

export const useDemo = create<DemoState>()(
  persist(
    (set) => ({
      enabled: false,
      fakeTime: null,
      anchor: null,
      setEnabled: (on) =>
        set((s) =>
          on ? { enabled: true, fakeTime: s.fakeTime ?? Date.now() } : { enabled: false, fakeTime: null, anchor: null },
        ),
    }),
    {
      name: 'triptrail-demo',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ enabled: s.enabled, fakeTime: s.fakeTime, anchor: s.anchor }),
    },
  ),
);

export const isDemoMode = () => useDemo.getState().enabled;
