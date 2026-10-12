import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { isLimitText, LimitNote } from '@/components/ui/LimitNote';
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

/**
 * A note from the Edge Functions, one line each: a daily-limit line ("Sample trips · free
 * daily limit reached, resets tomorrow") is the calm LimitNote, anything else a NoteLine.
 */
export function Notes({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <>
      {lines.map((line, i) => (isLimitText(line) ? <LimitNote key={i} text={line} /> : <NoteLine key={i} text={line} />))}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
