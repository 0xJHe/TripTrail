import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';

interface ErrorLineProps {
  message: string;
  /** Shows a "Try again" button after the words (every "Couldn't load…" line has one). */
  onRetry?: () => unknown;
}

/** Red problem line: icon + plain words (colour is never the only signal), optional Try again. */
export function ErrorLine({ message, onRetry }: ErrorLineProps) {
  return (
    <View style={styles.row} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={16} color={colors.red} />
      <Txt variant="b12" weight="semibold" color={colors.red} style={{ flex: 1 }}>
        {message}
      </Txt>
      {onRetry ? (
        <Pressable
          onPress={() => onRetry()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}
          testID="error-try-again">
          <Ionicons name="refresh" size={14} color={colors.tealDark} />
          <Txt variant="b12" weight="bold" color={colors.tealDark}>
            Try again
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.tealDark,
  },
});
