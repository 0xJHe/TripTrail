import { forwardRef } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, fontFamily, radius } from '@/lib/theme';
import { Txt } from './Txt';

interface FieldProps extends TextInputProps {
  prefix?: string;
  containerStyle?: StyleProp<ViewStyle>;
  mono?: boolean;
  invalid?: boolean;
}

/** Light grey for the "e.g. ..." hints, so an empty box never looks filled in. */
const PLACEHOLDER_COLOR = '#A3AAB6';

/**
 * White input box (prototype .field) with an optional grey prefix ("RM", "Month").
 * While empty, the placeholder shows light grey in regular weight (typed text is semibold).
 */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { prefix, containerStyle, mono, invalid, style, ...rest },
  ref,
) {
  return (
    <View style={[styles.field, invalid && { borderColor: colors.red }, containerStyle]}>
      {prefix ? <Txt style={styles.prefix}>{prefix}</Txt> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={PLACEHOLDER_COLOR}
        {...rest}
        style={[styles.input, mono && styles.mono, style, !rest.value && styles.placeholder]}
      />
    </View>
  );
});

/** Same box, but tappable (opens a picker). */
export function SelectField({
  prefix,
  value,
  onPress,
  style,
}: {
  prefix: string;
  value: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${prefix}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [styles.field, pressed && { borderColor: colors.teal }, style]}>
      <Txt style={styles.prefix}>{prefix}</Txt>
      <Txt style={[styles.input, styles.select]} numberOfLines={1}>
        {value}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.field,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  prefix: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.textMuted, marginRight: 8 },
  input: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 10,
  },
  select: { fontSize: 14, paddingVertical: 0 },
  placeholder: { fontFamily: fontFamily.regular },
  mono: { fontFamily: fontFamily.mono, letterSpacing: 1 },
});
