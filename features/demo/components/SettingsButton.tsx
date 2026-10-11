import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily } from '@/lib/theme';

/** Gear icon + "Settings" for navy headers; opens Settings (Demo mode). `label={false}` where there's no room. */
export function SettingsButton({ label = true }: { label?: boolean }) {
  return (
    <Pressable
      onPress={() => router.push('/settings')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Settings"
      testID="open-settings"
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}>
      <Ionicons name="settings-outline" size={20} color={colors.white} />
      {label ? (
        <Txt style={styles.label} color={colors.white}>
          Settings
        </Txt>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 6, marginHorizontal: 4 },
  label: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16 },
});
