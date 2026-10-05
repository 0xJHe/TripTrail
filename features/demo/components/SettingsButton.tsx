import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { colors } from '@/lib/theme';

/** Gear icon for navy headers; opens Settings (Demo mode). */
export function SettingsButton() {
  return (
    <Pressable
      onPress={() => router.push('/settings')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Settings"
      testID="open-settings"
      style={({ pressed }) => [{ padding: 6, marginHorizontal: 4 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name="settings-outline" size={20} color={colors.white} />
    </Pressable>
  );
}
