import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  backgroundLocationPermission,
  requestBackgroundLocationPermission,
  type LocationPermission,
} from '@/lib/location';

/** "Allow all the time" location, and the trips where the person said no (asked once per trip). */
interface BackgroundAccessState {
  /** null until checked. */
  permission: LocationPermission | null;
  declinedTrips: string[];
  refresh: () => Promise<void>;
  /** Ask (Android opens the location settings). Anything but "Allow all the time" counts as no. */
  ask: (tripId: string) => Promise<void>;
  decline: (tripId: string) => void;
}

export const useBackgroundAccess = create<BackgroundAccessState>()(
  persist(
    (set, get) => ({
      permission: null,
      declinedTrips: [],
      refresh: async () => {
        set({ permission: await backgroundLocationPermission() });
      },
      ask: async (tripId) => {
        const permission = await requestBackgroundLocationPermission();
        set({ permission });
        if (permission !== 'granted') get().decline(tripId);
      },
      decline: (tripId) =>
        set((s) => (s.declinedTrips.includes(tripId) ? s : { declinedTrips: [...s.declinedTrips, tripId].slice(-20) })),
    }),
    {
      name: 'triptrail-background-access',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ declinedTrips: s.declinedTrips }),
    },
  ),
);
