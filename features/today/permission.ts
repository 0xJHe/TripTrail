import { useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import { create } from 'zustand';

import { locationPermission, requestLocationPermission, type LocationPermission } from '@/lib/location';

/** Location permission, shared by the tracker (starts / stops reading GPS) and the Today tab (asks). */
interface AccessState {
  /** null until checked. */
  permission: LocationPermission | null;
  refresh: () => Promise<void>;
  /** Ask with the system prompt, or open the phone's Settings if it was turned off for good. */
  allow: () => Promise<void>;
}

export const useLocationAccess = create<AccessState>((set, get) => ({
  permission: null,
  refresh: async () => set({ permission: await locationPermission() }),
  allow: async () => {
    if (get().permission === 'blocked') {
      await Linking.openSettings().catch(() => {});
      return; // checked again when the app comes back to the front
    }
    set({ permission: await requestLocationPermission() });
  },
}));

/** Check the permission now and whenever the app comes back to the front (e.g. from Settings). */
export function useWatchLocationPermission() {
  useEffect(() => {
    const { refresh } = useLocationAccess.getState();
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, []);
}
