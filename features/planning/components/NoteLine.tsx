import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';

/** Small amber "worth knowing" line, e.g. "No dates suit all 4, these suit 3 of 4". */
export function NoteLine({ text }: { text: string }) {
  return (
    <View style={styles.row} accessibilityRole="text">
      <Ionicons name="information-circle" size={16} color={colors.amber} />
      <Txt variant="s11" weight="semibold" color={colors.amberText} style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
