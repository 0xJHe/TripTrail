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

/** Navy top bar with title + subtitle (prototype .top). Draws under the status bar. */
export function NavyHeader({ title, subtitle, onBack, right }: NavyHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
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
        <View style={{ flex: 1 }}>
          <Txt variant="h17" color={colors.white} numberOfLines={1}>
            {title}
          </Txt>
          {subtitle ? (
            <Txt variant="b12" color={colors.textOnNavy} style={{ marginTop: 2 }} numberOfLines={1}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { backgroundColor: colors.navy, paddingHorizontal: 18, paddingBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { marginLeft: -6 },
});
