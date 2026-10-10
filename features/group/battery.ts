import * as Battery from 'expo-battery';

/** This phone's battery %, null when it can't tell. */
export async function readBattery(): Promise<number | null> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    return level >= 0 ? Math.round(level * 100) : null;
  } catch {
    return null;
  }
}
