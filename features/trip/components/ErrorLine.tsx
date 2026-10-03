import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';

/** Red problem line: icon + plain words (colour is never the only signal). */
export function ErrorLine({ message }: { message: string }) {
  return (
    <View style={styles.row} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={16} color={colors.red} />
      <Txt variant="b12" weight="semibold" color={colors.red} style={{ flex: 1 }}>
        {message}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
