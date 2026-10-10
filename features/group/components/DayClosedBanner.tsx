import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily, shadow } from '@/lib/theme';

interface DayClosedBannerProps {
  onReopen: () => void;
  saving: boolean;
  error: string | null;
}

/** Top of the Group map after Done for today: "You've closed today · location sharing is off" + Reopen today. */
export function DayClosedBanner({ onReopen, saving, error }: DayClosedBannerProps) {
  return (
    <View style={styles.banner} testID="day-closed-banner">
      <View style={styles.row}>
        <Ionicons name="moon-outline" size={16} color={colors.textMuted} />
        <Txt variant="b12" style={{ flex: 1 }} numberOfLines={2}>
          You've closed today · location sharing is off
        </Txt>
        <Pressable
          onPress={saving ? undefined : onReopen}
          hitSlop={10}
          accessibilityRole="link"
          accessibilityLabel="Reopen today"
          testID="map-reopen-today"
          style={({ pressed }) => pressed && { opacity: 0.6 }}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.teal} />
          ) : (
            <Txt style={styles.link} color={colors.tealDark}>
              Reopen today
            </Txt>
          )}
        </Pressable>
      </View>
      {error ? (
        <Txt variant="s11" color={colors.red}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 2,
    ...shadow,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 16 },
});
