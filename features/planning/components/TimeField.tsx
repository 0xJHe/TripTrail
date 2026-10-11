import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Field } from '@/components/ui/Field';
import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily, radius } from '@/lib/theme';
import { phoneUses24h, timePicker } from '../phoneClock';
import { clockForPhone, clockText, parseClock } from '../stops';

interface TimeFieldProps {
  prefix: string;
  /** Saved form "09:30", or '' when not picked yet. */
  value: string;
  onChange: (clock: string) => void;
  /** Where the clock opens when nothing is picked yet ("09:30"); the box itself stays empty. */
  opensAt?: string;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A time box: tap it to open the phone's clock picker. Shows the time the phone's way
 * (12 or 24-hour) and hands back "09:30". Without the picker (an older build), you type it.
 */
export function TimeField({ prefix, value, onChange, opensAt, containerStyle, testID }: TimeFieldProps) {
  const picker = timePicker();
  if (!picker) {
    return (
      <Field
        prefix={prefix}
        value={value}
        onChangeText={onChange}
        placeholder="09:30"
        keyboardType="numbers-and-punctuation"
        containerStyle={containerStyle}
        testID={testID}
      />
    );
  }

  function open() {
    const minutes = parseClock(value) ?? parseClock(opensAt ?? '') ?? 9 * 60;
    picker!.open({
      mode: 'time',
      value: new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60),
      onValueChange: (_event, date) => onChange(clockText(date.getHours() * 60 + date.getMinutes())),
    });
  }

  const shown = value ? clockForPhone(value, phoneUses24h()) : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${prefix}: ${shown || 'not picked'}. Pick a time`}
      onPress={open}
      testID={testID}
      style={({ pressed }) => [styles.field, pressed && { borderColor: colors.teal }, containerStyle]}>
      <Txt style={styles.prefix}>{prefix}</Txt>
      <Txt style={shown ? styles.value : styles.placeholder} numberOfLines={1}>
        {shown || 'Pick time'}
      </Txt>
    </Pressable>
  );
}

// Same box as components/ui/Field.
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
  value: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 16, color: colors.text },
  placeholder: { flex: 1, fontFamily: fontFamily.regular, fontSize: 16, color: '#A3AAB6' },
});
