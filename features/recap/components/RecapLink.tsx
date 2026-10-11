import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors, radius, shadow } from '@/lib/theme';

/** Plan tab, on a finished day: opens that day's recap story card (screen 15). */
export function RecapLink({ day }: { day: number }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/recap', params: { day: String(day) } })}
      accessibilityRole="link"
      accessibilityLabel={`Day ${day} recap`}
      testID="day-recap-link"
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <View style={styles.icon}>
        <Ionicons name="trail-sign-outline" size={18} color={colors.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="h14">Day recap</Txt>
        <Txt variant="s11">Your route, stops and stats as a story card to share</Txt>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...shadow,
  },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
});
