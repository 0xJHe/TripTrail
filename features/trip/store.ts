import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface CurrentTripState {
  /** The trip the Plan / Today / Map / Group tabs show. */
  currentTripId: string | null;
  setCurrentTrip: (id: string | null) => void;
}

export const useCurrentTrip = create<CurrentTripState>()(
  persist(
    (set) => ({
      currentTripId: null,
      setCurrentTrip: (id) => set({ currentTripId: id }),
    }),
    { name: 'triptrail-current-trip', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
