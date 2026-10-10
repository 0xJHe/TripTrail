import AsyncStorage from '@react-native-async-storage/async-storage';

import { now } from '@/lib/clock';
import { onBackgroundLocation, startBackgroundUpdates, stopBackgroundUpdates } from '@/lib/location';
import { colors } from '@/lib/theme';
import { saveLocation } from './api';
import { readBattery } from './battery';
import { inWindow } from './groupMap';

/**
 * Sharing with the screen off (Android, development build / APK only). The app saves what
 * to share and until when; each background fix (about every 60 s, lib/location.ts) is
 * saved to `locations` with the battery, until the sharing window ends.
 * Imported once from app/_layout.tsx so the handler exists when the task wakes the app.
 */

export interface ShareConfig {
  tripId: string;
  memberId: string;
  /** The sharing window (ms): 60 min before the day's first stop to 60 min after the last. */
  from: number;
  to: number;
}

const CONFIG_KEY = 'triptrail-background-share';
/** Fixes closer together than this are skipped (Android can deliver a few at once). */
export const MIN_GAP_MS = 50_000;

const NOTICE = {
  title: 'TripTrail is sharing your location with your group',
  body: "Until 1 hour after today's last stop.",
  color: colors.teal,
};

/** What to do with a background fix at time t. */
export function fixAction(config: ShareConfig | null, t: number, lastSavedAt: number | null): 'save' | 'skip' | 'stop' {
  if (!config || !inWindow(config, t)) return 'stop';
  if (lastSavedAt != null && t - lastSavedAt < MIN_GAP_MS) return 'skip';
  return 'save';
}

async function readConfig(): Promise<ShareConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as ShareConfig) : null;
  } catch {
    return null;
  }
}

/** Start (or update) sharing in the background for this trip day. */
export async function startBackgroundSharing(config: ShareConfig): Promise<boolean> {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config)).catch(() => {});
  return startBackgroundUpdates(NOTICE);
}

/** Stop sharing in the background (outside the window, Demo mode, permission taken away). */
export async function stopBackgroundSharing(): Promise<void> {
  await AsyncStorage.removeItem(CONFIG_KEY).catch(() => {});
  await stopBackgroundUpdates();
}

let lastSavedAt: number | null = null;

onBackgroundLocation(async (fix) => {
  const config = await readConfig();
  const t = now().getTime();
  const action = fixAction(config, t, lastSavedAt);
  if (action === 'stop') {
    await stopBackgroundSharing();
    return;
  }
  if (action === 'skip' || !config) return;
  lastSavedAt = t;
  try {
    await saveLocation({
      trip_id: config.tripId,
      member_id: config.memberId,
      lat: fix.lat,
      lng: fix.lng,
      battery: await readBattery(),
      recorded_at: new Date(t).toISOString(),
    });
  } catch {
    // Offline: the next fix tries again.
    lastSavedAt = null;
  }
});
