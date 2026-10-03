import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fontFamily } from '@/lib/theme';
import { Txt } from './Txt';

interface ChipProps {
  label: string;
  selected?: boolean;
  /** Selected colour: teal for a pick, red for a no-go. */
  tone?: 'teal' | 'red';
  size?: 'md' | 'sm';
  ghost?: boolean;
  dimmed?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Pill chip (prototype .chip / .chip.on / .chip.no / .chip.ghost). */
export function Chip({ label, selected, tone = 'teal', size = 'md', ghost, dimmed, onPress, style }: ChipProps) {
  const chipStyle = [
    styles.chip,
    size === 'sm' && styles.sm,
    ghost && styles.ghost,
    selected && (tone === 'red' ? styles.no : styles.on),
    dimmed && !selected && { opacity: 0.45 },
    style,
  ];
  const text = (
    <Txt style={[styles.label, size === 'sm' && styles.labelSm]} color={selected ? colors.white : colors.text}>
      {label}
    </Txt>
  );
  if (!onPress) return <View style={chipStyle}>{text}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      hitSlop={3}
      style={({ pressed }) => [chipStyle, pressed && { opacity: 0.8 }]}>
      {text}
    </Pressable>
  );
}

/** Wrapping row of chips. */
export function Chips({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sm: { paddingVertical: 5, paddingHorizontal: 10 },
  ghost: { backgroundColor: colors.chip, borderColor: colors.chip },
  on: { backgroundColor: colors.teal, borderColor: colors.teal },
  no: { backgroundColor: colors.red, borderColor: colors.red },
  label: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 15 },
  labelSm: { fontSize: 11, lineHeight: 14 },
});
