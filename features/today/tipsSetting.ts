import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Settings > First-timer tips (on by default, saved on the phone). Off = no tip card on arrival. */
interface TipsState {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
}

export const useTipsSetting = create<TipsState>()(
  persist(
    (set) => ({
      enabled: true,
      setEnabled: (on) => set({ enabled: on }),
    }),
    {
      name: 'triptrail-tips',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ enabled: s.enabled }),
    },
  ),
);
