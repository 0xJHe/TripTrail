import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { button, colors, fontFamily, radius } from '@/lib/theme';
import { Txt } from './Txt';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'sm';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Teal primary button (prototype .btn) or white outline secondary (.btn.sec2). */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  icon,
  style,
  testID,
}: ButtonProps) {
  const off = disabled || loading;
  const primary = variant === 'primary';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.sm,
        primary ? styles.primary : styles.secondary,
        primary && disabled && styles.off,
        pressed && !off && { opacity: 0.85 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={primary ? colors.white : colors.teal} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Txt style={[styles.label, size === 'sm' && styles.labelSm]} color={primary ? colors.white : colors.text}>
            {label}
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: button.minHeight + 2,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sm: { minHeight: 40, borderRadius: 12 },
  primary: {
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 3,
  },
  secondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  off: { backgroundColor: colors.disabled, shadowOpacity: 0, elevation: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontFamily: fontFamily.bold, fontSize: 15, lineHeight: 20 },
  labelSm: { fontSize: 13, lineHeight: 17 },
});
