import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/lib/theme';
import { Txt } from './Txt';

interface NavyHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}

/**
 * Navy top bar with title + subtitle (prototype .top). Draws under the status bar and keeps clear
 * of side cutouts (safe area). The title shrinks (one line, cut with …); `right` never shrinks,
 * so its buttons always fit on screen.
 */
export function NavyHeader({ title, subtitle, onBack, right }: NavyHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.top, { paddingTop: insets.top + 12, paddingLeft: insets.left + PAD, paddingRight: insets.right + PAD }]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
        ) : null}
        <View style={styles.titles}>
          <Txt variant="h17" color={colors.white} numberOfLines={1}>
            {title}
          </Txt>
          {subtitle ? (
            <Txt variant="b12" color={colors.textOnNavy} style={{ marginTop: 2 }} numberOfLines={1}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

/** Space from the screen edge (plus the safe-area inset). */
const PAD = 18;

const styles = StyleSheet.create({
  top: { backgroundColor: colors.navy, paddingBottom: 14 },
  titles: { flex: 1, minWidth: 0 },
  right: { flexShrink: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { marginLeft: -6 },
});
