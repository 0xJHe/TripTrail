import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Group map choices saved on this phone. */
interface MapPrefsState {
  /** Show Google's own places and business icons (off = the clean style). */
  showPlaces: boolean;
  setShowPlaces: (on: boolean) => void;
}

export const useMapPrefs = create<MapPrefsState>()(
  persist(
    (set) => ({
      showPlaces: false,
      setShowPlaces: (showPlaces) => set({ showPlaces }),
    }),
    {
      name: 'triptrail-map-prefs',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ showPlaces: s.showPlaces }),
    },
  ),
);
