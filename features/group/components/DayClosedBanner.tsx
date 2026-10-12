import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors, shadow } from '@/lib/theme';

/** Top of the Group map after Done for today: "You've closed today · location sharing is off" (final, no reopen). */
export function DayClosedBanner() {
  return (
    <View style={styles.banner} testID="day-closed-banner">
      <View style={styles.row}>
        <Ionicons name="moon-outline" size={16} color={colors.textMuted} />
        <Txt variant="b12" style={{ flex: 1 }} numberOfLines={2}>
          You've closed today · location sharing is off
        </Txt>
      </View>
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
    ...shadow,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
