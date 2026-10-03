import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily, shadow } from '@/lib/theme';

interface DeckActionsProps {
  onPass: () => void;
  onDetails: () => void;
  onLike: () => void;
  disabled?: boolean;
}

/** Pass (✕), Details (i) and Like (♥) buttons under the deck, with the swipe hints. */
export function DeckActions({ onPass, onDetails, onLike, disabled }: DeckActionsProps) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.row}>
        <Pressable
          onPress={onPass}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Pass on this trip"
          style={({ pressed }) => [styles.big, styles.white, pressed && styles.pressed]}>
          <Ionicons name="close" size={30} color={colors.red} />
        </Pressable>
        <View style={styles.details}>
          <Pressable
            onPress={onDetails}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Trip details"
            style={({ pressed }) => [styles.small, styles.white, pressed && styles.pressed]}>
            <Ionicons name="information-circle-outline" size={24} color={colors.textMuted} />
          </Pressable>
          <Txt style={styles.detailsText} color={colors.textMuted}>
            Details
          </Txt>
        </View>
        <Pressable
          onPress={onLike}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Like this trip"
          style={({ pressed }) => [styles.big, styles.teal, pressed && styles.pressed]}>
          <Ionicons name="heart" size={26} color={colors.white} />
        </Pressable>
      </View>
      <View style={styles.hints}>
        <View style={styles.hint}>
          <Ionicons name="arrow-back" size={15} color={colors.red} />
          <Txt variant="s11" weight="bold" color={colors.red}>
            Swipe left to pass
          </Txt>
        </View>
        <View style={styles.hint}>
          <Txt variant="s11" weight="bold" color={colors.tealDark}>
            Swipe right to like
          </Txt>
          <Ionicons name="arrow-forward" size={15} color={colors.tealDark} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 30 },
  big: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  small: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  white: { backgroundColor: colors.white, ...shadow },
  teal: {
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  pressed: { transform: [{ scale: 0.94 }] },
  details: { alignItems: 'center', gap: 6, marginTop: 8 },
  detailsText: { fontFamily: fontFamily.bold, fontSize: 10.5, lineHeight: 13 },
  hints: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
