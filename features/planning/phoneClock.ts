import { Platform, TurboModuleRegistry } from 'react-native';

/**
 * The phone's clock picker (@react-native-community/datetimepicker) and its 12 / 24-hour
 * setting (expo-localization). Both are native: they are loaded only when there, so an
 * older build without them falls back to typing the time instead of crashing.
 */

type PickerAndroid = typeof import('@react-native-community/datetimepicker').DateTimePickerAndroid;

/** Android's clock picker, or null (not Android, or a build made before it was added). */
export function timePicker(): PickerAndroid | null {
  if (Platform.OS !== 'android' || !TurboModuleRegistry.get('RNCTimePicker')) return null;
  try {
    const mod = require('@react-native-community/datetimepicker') as typeof import('@react-native-community/datetimepicker');
    return mod.DateTimePickerAndroid;
  } catch {
    return null;
  }
}

/** True when the phone shows 24-hour times (Settings > Date & time). */
export function phoneUses24h(): boolean {
  try {
    const { getCalendars } = require('expo-localization') as typeof import('expo-localization');
    const uses = getCalendars()[0]?.uses24hourClock;
    if (uses != null) return uses;
  } catch {
    // Older build without expo-localization: go by the language's usual format.
  }
  try {
    return !new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12;
  } catch {
    return true;
  }
}
