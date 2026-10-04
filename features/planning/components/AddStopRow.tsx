import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily } from '@/lib/theme';

/** Dashed "+ Add a stop" at the end of the timeline. */
export function AddStopRow({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.stop}>
      <View style={styles.dot} />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Add a stop"
        testID="add-stop"
        style={({ pressed }) => [styles.box, pressed && { backgroundColor: colors.tealTint }]}>
        <Ionicons name="add" size={18} color={colors.tealDark} />
        <Txt style={styles.label} color={colors.tealDark}>
          Add a stop
        </Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.disabled },
  box: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.disabled,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  label: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 17 },
});
