import * as Battery from 'expo-battery';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { dayFinished, shareNow } from '@/features/recap/dayEnd';
import { useDayClosures } from '@/features/recap/hooks/useDayClosures';
import { useLocationAccess } from '@/features/today/permission';
import { useMembers, useMyMember } from '@/features/trip/hooks/useTrip';
import { useCurrentTrip } from '@/features/trip/store';
import { now } from '@/lib/clock';
import { backgroundSupported, getGroupLocation, useLocationSource } from '@/lib/location';
import { saveLocation } from '../api';
import { useBackgroundAccess } from '../backgroundAccess';
import { startBackgroundSharing, stopBackgroundSharing } from '../backgroundShare';
import { readBattery } from '../battery';
import { LOW_BATTERY } from '../groupMap';
import { useTripDay } from './useTripDay';

/** How often this phone saves its position + battery while the app is open (foreground-only sharing). */
export const SHARE_EVERY_MS = 45_000;

/**
 * Shares this phone's position (lib/location.ts) and battery to `locations` on a trip day,
 * from 60 min before the first stop until this person taps Done for today (or the day ends;
 * no cut-off after the last stop). It starts again 60 min before the next day's first stop,
 * when the app is opened. Mounted once in the tabs layout.
 * - "Allow all the time" given (development build / APK on Android): background updates
 *   about every 60 s, screen off too, with Android's notification (features/group/backgroundShare.ts).
 *   They stop by themselves when the window ends. Once the last stop is finished the
 *   notification becomes "Still sharing your location" (tap Done for today).
 * - Otherwise (Expo Go, or the person said no): every 45 s while the app is open.
 * Also saves straight away when the battery drops below 15%, so the group has the last
 * known position before the phone goes dark. Demo mode never saves anything.
 */
export function useShareLocation() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const members = useMembers(tripId);
  const me = useMyMember(tripId);
  const { day, dayStops, window, time, ready } = useTripDay(tripId);
  const closures = useDayClosures(tripId, day);
  const t = time.getTime();
  const sharing = shareNow(window, t, closures.mine);
  const finished = dayFinished(dayStops, t);
  const permission = useLocationAccess((s) => s.permission);
  const bgPermission = useBackgroundAccess((s) => s.permission);
  const demo = useLocationSource() === 'demo';
  const memberId = me?.id;
  const on = !demo && !!tripId && !!memberId && sharing && permission === 'granted';
  const background = on && backgroundSupported() && bgPermission === 'granted';
  // Only start / stop the background service once everything is known (not while loading).
  const known =
    ready &&
    closures.ready &&
    (!tripId || members.isSuccess) &&
    permission !== null &&
    (!backgroundSupported() || bgPermission !== null);

  // Check "Allow all the time" now and whenever the app comes back (e.g. from the settings page).
  useEffect(() => {
    const { refresh } = useBackgroundAccess.getState();
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, []);

  // Background sharing on for this window, or off.
  const from = window?.from;
  const to = window?.to;
  useEffect(() => {
    if (!known || !backgroundSupported()) return;
    if (background && tripId && memberId && from != null && to != null) {
      startBackgroundSharing({ tripId, memberId, from, to, notice: finished ? 'finished' : 'sharing' });
    } else {
      stopBackgroundSharing();
    }
  }, [known, background, tripId, memberId, from, to, finished]);

  // Foreground sharing (the background task does it when it runs), plus the low-battery save.
  useEffect(() => {
    if (!on || !tripId || !memberId) return;
    let active = AppState.currentState === 'active';
    let busy = false;
    let wasLow: boolean | null = null;
    const share = async () => {
      if (!active || busy) return;
      busy = true;
      try {
        const loc = await getGroupLocation();
        // Only a real GPS fix of this phone is shared (never the demo route).
        if (!loc || loc.source !== 'gps' || !loc.me) return;
        await saveLocation({
          trip_id: tripId,
          member_id: memberId,
          lat: loc.me.lat,
          lng: loc.me.lng,
          battery: await readBattery(),
          recorded_at: now().toISOString(),
        });
      } catch {
        // Offline or a hiccup: the next tick tries again.
      } finally {
        busy = false;
      }
    };
    let id: ReturnType<typeof setInterval> | null = null;
    let appSub: { remove: () => void } | null = null;
    if (!background) {
      share();
      id = setInterval(share, SHARE_EVERY_MS);
      appSub = AppState.addEventListener('change', (s) => {
        active = s === 'active';
        if (active) share();
      });
    }
    let batterySub: { remove: () => void } | null = null;
    try {
      batterySub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
        if (batteryLevel < 0) return;
        const low = Math.round(batteryLevel * 100) < LOW_BATTERY;
        if (low && wasLow === false) share();
        wasLow = low;
      });
    } catch {
      batterySub = null;
    }
    return () => {
      if (id) clearInterval(id);
      appSub?.remove();
      batterySub?.remove();
    };
  }, [on, background, tripId, memberId]);
}
