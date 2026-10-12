import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';

/** Every "a daily limit caused this fallback" note ends with this, so it reads as a limit, not a bug. */
export const LIMIT_REACHED = 'free daily limit reached, resets tomorrow';

/** "Weather paused · free daily limit reached, resets tomorrow". */
export function limitText(what: string): string {
  return `${what} · ${LIMIT_REACHED}`;
}

/** A note (e.g. from an Edge Function) that is about a daily limit. */
export function isLimitText(text: string): boolean {
  return text.trim().endsWith(LIMIT_REACHED);
}

/**
 * Small calm grey line with a pause icon: something fell back because a free daily limit
 * was reached (our per-trip limits, Google's quota, or every Gemini model used up).
 * Only for limits; other problems keep their own messages.
 */
export function LimitNote({ what, text, onDark, style }: { what?: string; text?: string; onDark?: boolean; style?: StyleProp<ViewStyle> }) {
  const line = text ?? limitText(what ?? 'Paused');
  const color = onDark ? '#C9D8EE' : colors.textMuted;
  return (
    <View style={[styles.row, style]} accessibilityRole="text" accessibilityLabel={line} testID="limit-note">
      <Ionicons name="pause-circle-outline" size={14} color={color} />
      <Txt variant="s11" color={color} style={styles.text}>
        {line}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  text: { flex: 1 },
});
