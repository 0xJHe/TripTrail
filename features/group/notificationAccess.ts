import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Android 13+ (API 33) hides app notifications until the person allows them, so the
 * "TripTrail is sharing your location" notice of background sharing would never show.
 * Asked once (after our explanation in BackgroundAskCard) when background sharing starts.
 */
export const NOTIFICATIONS_FROM_API = 33;

/** Android 13+ needs a yes before notifications show; older Android allows them already. */
export function notificationsNeedAsk(os: string, apiLevel: number): boolean {
  return os === 'android' && apiLevel >= NOTIFICATIONS_FROM_API;
}

export type NotificationPermission = 'granted' | 'denied' | 'ask';

interface NotificationAccessState {
  /** null until checked. 'granted' too where no question is needed. */
  permission: NotificationPermission | null;
  /** Answered our card (yes or Not now): never shown again on this phone. */
  answered: boolean;
  refresh: () => Promise<void>;
  ask: () => Promise<void>;
  decline: () => void;
}

const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS' as const;

function needAsk(): boolean {
  return notificationsNeedAsk(Platform.OS, typeof Platform.Version === 'number' ? Platform.Version : 0);
}

export const useNotificationAccess = create<NotificationAccessState>()(
  persist(
    (set) => ({
      permission: null,
      answered: false,
      refresh: async () => {
        if (!needAsk()) {
          set({ permission: 'granted' });
          return;
        }
        try {
          set({ permission: (await PermissionsAndroid.check(POST_NOTIFICATIONS)) ? 'granted' : 'ask' });
        } catch {
          set({ permission: 'granted' }); // can't tell: don't nag
        }
      },
      ask: async () => {
        let permission: NotificationPermission = 'denied';
        try {
          const result = await PermissionsAndroid.request(POST_NOTIFICATIONS);
          permission = result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
        } catch {
          // An older build without the permission in its manifest: treat as a no.
        }
        set({ permission, answered: true });
      },
      decline: () => set({ answered: true }),
    }),
    {
      name: 'triptrail-notification-access',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ answered: s.answered }),
    },
  ),
);
