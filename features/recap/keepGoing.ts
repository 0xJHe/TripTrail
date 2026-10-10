import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * "Keep going" on the Today tab: this person's choice for a trip day, saved on the phone.
 * Stored with now() when tapped, so Demo mode Reset (clock back) brings the card back.
 */
interface KeepGoingState {
  /** `${tripId}:${day}` -> when tapped (ms). */
  at: Record<string, number>;
  keepGoing: (tripId: string, day: number, t: number) => void;
}

const key = (tripId: string, day: number) => `${tripId}:${day}`;

export const useKeepGoing = create<KeepGoingState>()(
  persist(
    (set) => ({
      at: {},
      keepGoing: (tripId, day, t) =>
        set((s) => {
          // Keep the last 30 days or so.
          const entries = Object.entries({ ...s.at, [key(tripId, day)]: t }).slice(-30);
          return { at: Object.fromEntries(entries) };
        }),
    }),
    { name: 'triptrail-keep-going', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** Whether "Keep going" was tapped for this day by time t. */
export function keptGoing(at: Record<string, number>, tripId: string | undefined, day: number, t: number): boolean {
  if (!tripId) return false;
  const tapped = at[key(tripId, day)];
  return tapped != null && tapped <= t;
}
