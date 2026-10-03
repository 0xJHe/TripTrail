import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fontFamily } from '@/lib/theme';

/** Text styles from design/prototype.html (h22, h15, h14, b13, b12, s11, sec, lbl). */
export const textStyles = StyleSheet.create({
  h22: { fontFamily: fontFamily.extrabold, fontSize: 22, letterSpacing: -0.4, lineHeight: 26, color: colors.text },
  h17: { fontFamily: fontFamily.bold, fontSize: 17, letterSpacing: -0.2, lineHeight: 22, color: colors.text },
  h15: { fontFamily: fontFamily.bold, fontSize: 15, letterSpacing: -0.15, lineHeight: 20, color: colors.text },
  h14: { fontFamily: fontFamily.bold, fontSize: 14, lineHeight: 18, color: colors.text },
  b13: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19, color: colors.text },
  b12: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, color: colors.text },
  s11: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  sec: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 17, color: colors.text },
  lbl: { fontFamily: fontFamily.bold, fontSize: 11, lineHeight: 14, color: colors.textMuted },
});

export type TextVariant = keyof typeof textStyles;

type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

interface TxtProps extends TextProps {
  variant?: TextVariant;
  weight?: Weight;
  color?: string;
}

/** Inter text. Use `weight` instead of fontWeight (custom fonts ignore fontWeight on Android). */
export function Txt({ variant = 'b13', weight, color, style, ...rest }: TxtProps) {
  return (
    <Text
      {...rest}
      style={[
        textStyles[variant],
        weight && { fontFamily: fontFamily[weight] },
        color !== undefined && { color },
        style,
      ]}
    />
  );
}
