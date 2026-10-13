import * as Battery from 'expo-battery';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** How often this phone reads its own battery while the app is open. */
export const BATTERY_READ_EVERY_MS = 20_000;
/** A change this big (in %) is shared with the group straight away. */
export const BATTERY_JUMP = 5;

/**
 * expo-battery's 0–1 level as a whole %, null when unknown (-1, e.g. an emulator). Rounded,
 * not floored: Android sends 57/100 as a float (0.569999…), which is 57 %, not 56.
 */
export function batteryPercent(level: number): number | null {
  if (!Number.isFinite(level) || level < 0) return null;
  return Math.min(100, Math.max(0, Math.round(level * 100)));
}

/** This phone's battery %, null when it can't tell. */
export async function readBattery(): Promise<number | null> {
  try {
    return batteryPercent(await Battery.getBatteryLevelAsync());
  } catch {
    return null;
  }
}

/** The battery changed by BATTERY_JUMP % or more since `shared` (or nothing was shared yet). */
export function bigBatteryChange(shared: number | null, current: number | null): boolean {
  if (current == null) return false;
  return shared == null || Math.abs(current - shared) >= BATTERY_JUMP;
}

/**
 * This phone's battery %, kept current: read now, every 20 s while the app is open and when it
 * comes back. Not Battery.useBatteryLevel(): on Android its listener only fires when the phone
 * reaches "battery low" / "battery okay", so the % it gives stays at the first reading.
 */
export function useBatteryPercent(): number | null {
  const [percent, setPercent] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => {
      readBattery().then((p) => {
        if (alive && p != null) setPercent(p);
      });
    };
    read();
    const id = setInterval(read, BATTERY_READ_EVERY_MS);
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') read();
    });
    let levelSub: { remove: () => void } | null = null;
    try {
      levelSub = Battery.addBatteryLevelListener(read);
    } catch {
      levelSub = null;
    }
    return () => {
      alive = false;
      clearInterval(id);
      appSub.remove();
      levelSub?.remove();
    };
  }, []);
  return percent;
}
