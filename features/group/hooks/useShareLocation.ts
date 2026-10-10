import * as Battery from 'expo-battery';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useLocationAccess } from '@/features/today/permission';
import { useMyMember } from '@/features/trip/hooks/useTrip';
import { useCurrentTrip } from '@/features/trip/store';
import { now } from '@/lib/clock';
import { getGroupLocation } from '@/lib/location';
import { saveLocation } from '../api';
import { LOW_BATTERY } from '../groupMap';
import { useTripDay } from './useTripDay';

/** How often this phone saves its position + battery while the app is open. */
export const SHARE_EVERY_MS = 45_000;

/** Battery %, null when the phone can't tell. */
async function readBattery(): Promise<number | null> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    return level >= 0 ? Math.round(level * 100) : null;
  } catch {
    return null;
  }
}

/**
 * Saves this phone's position (lib/location.ts) and battery to `locations` every 45 s while
 * the app is open on a trip day, from 60 min before the first stop to 60 min after the last.
 * Also saves straight away when the battery drops below 15%, so the group has the last
 * known position before the phone goes dark. Mounted once in the tabs layout.
 * Demo mode saves nothing: the map shows the demo route's members instead.
 */
export function useShareLocation() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const me = useMyMember(tripId);
  const { sharing } = useTripDay(tripId);
  const permission = useLocationAccess((s) => s.permission);
  const memberId = me?.id;
  const on = !!tripId && !!memberId && sharing && permission === 'granted';

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
    share();
    const id = setInterval(share, SHARE_EVERY_MS);
    const appSub = AppState.addEventListener('change', (s) => {
      active = s === 'active';
      if (active) share();
    });
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
      clearInterval(id);
      appSub.remove();
      batterySub?.remove();
    };
  }, [on, tripId, memberId]);
}
