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
  /** The sharing window (ms): 60 min before the day's first stop to the end of the day (groupMap.ts sharingWindow). */
  from: number;
  to: number;
  /** Which notification shows: 'finished' once the day's last stop is finished. */
  notice?: NoticeKind;
}

/**
 * Android's notification while sharing. Once the day's last stop is finished it becomes a
 * reminder, since sharing goes on until the person taps Done for today.
 */
export type NoticeKind = 'sharing' | 'finished';

export const NOTICES: Record<NoticeKind, { title: string; body: string; color: string }> = {
  sharing: {
    title: 'TripTrail is sharing your location with your group',
    body: 'Until you tap Done for today.',
    color: colors.teal,
  },
  finished: {
    title: 'Still sharing your location',
    body: "Tap Done for today in TripTrail when you're finished",
    color: colors.teal,
  },
};

const CONFIG_KEY = 'triptrail-background-share';
/** Fixes closer together than this are skipped (Android can deliver a few at once). */
export const MIN_GAP_MS = 50_000;

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

/** Start (or update) sharing in the background for this trip day. A new notification restarts the updates. */
export async function startBackgroundSharing(config: ShareConfig): Promise<boolean> {
  const before = await readConfig();
  const notice = config.notice ?? 'sharing';
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify({ ...config, notice })).catch(() => {});
  // Android keeps the notification it started with: stop and start again to change it.
  if (before && (before.notice ?? 'sharing') !== notice) await stopBackgroundUpdates();
  return startBackgroundUpdates(NOTICES[notice]);
}

/**
 * Start the running updates again so Android shows their notification (after notifications were
 * allowed on Android 13+; one posted before that stays hidden). Nothing when not sharing.
 */
export async function restartBackgroundNotice(): Promise<void> {
  const config = await readConfig();
  if (!config) return;
  await stopBackgroundUpdates();
  await startBackgroundUpdates(NOTICES[config.notice ?? 'sharing']);
}

/** Stop sharing in the background (outside the window, Done for today, Demo mode, permission taken away). */
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
