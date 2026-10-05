import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';

/** Amber "First-timer tip" for the stop the group just arrived at. */
export function TipCard({ tip, onClose }: { tip: string; onClose: () => void }) {
  return (
    <View style={styles.tint} accessibilityRole="summary" testID="tip-card">
      <Ionicons name="bulb-outline" size={18} color={colors.amber} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="b12" weight="bold" color={colors.amberText}>
          First-timer tip
        </Txt>
        <Txt variant="b13">{tip}</Txt>
      </View>
      <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide tip">
        <Ionicons name="close" size={18} color={colors.amber} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: '#FFF4DF',
  },
});
