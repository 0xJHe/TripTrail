import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatars, type AvatarItem } from '@/components/ui/Avatars';
import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily } from '@/lib/theme';

interface ChooseBarProps {
  optionName: string;
  /** Members who chose this trip. */
  choosers: AvatarItem[];
  mine: boolean;
  onChoose: () => void;
  disabled?: boolean;
}

/** Bottom of a trip card: who chose it, and my "Choose this trip" button. */
export function ChooseBar({ optionName, choosers, mine, onChoose, disabled }: ChooseBarProps) {
  return (
    <View style={styles.row}>
      <View style={styles.who}>
        {choosers.length ? (
          <>
            <Avatars people={choosers} size={22} />
            <Txt variant="s11" weight="semibold">
              {choosers.length} chose
            </Txt>
          </>
        ) : (
          <Txt variant="s11">Nobody chose yet</Txt>
        )}
      </View>
      {mine ? (
        <View style={styles.mine} accessibilityLabel={`Your choice: ${optionName}`}>
          <Ionicons name="checkmark-circle" size={16} color={colors.teal} />
          <Txt variant="s11" weight="bold" color={colors.tealDark}>
            Your choice
          </Txt>
        </View>
      ) : (
        <Pressable
          onPress={disabled ? undefined : onChoose}
          accessibilityRole="button"
          accessibilityLabel={`Choose ${optionName}`}
          accessibilityState={{ disabled: !!disabled }}
          hitSlop={6}
          style={({ pressed }) => [styles.button, (pressed || disabled) && { opacity: 0.7 }]}>
          <Txt style={styles.buttonText} color={colors.white}>
            Choose this trip
          </Txt>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  button: {
    backgroundColor: colors.teal,
    borderRadius: 10,
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 16 },
});
