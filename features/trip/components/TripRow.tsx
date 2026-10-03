import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { formatRange } from '@/features/planning/dates';
import { colors, radius, shadow } from '@/lib/theme';
import type { Trip } from '../types';

/** One line under the trip name saying where planning is up to. */
export function tripStatus(trip: Trip): { text: string; color: string } {
  if (trip.stage === 'decided') {
    const when = trip.start_date && trip.end_date ? ` · ${formatRange(trip.start_date, trip.end_date)}` : '';
    return { text: `${trip.destination ?? 'Trip picked'}${when}`, color: colors.tealDark };
  }
  if (trip.stage === 'voting') return { text: 'Step 2 of 3 · Swipe on trip options', color: colors.amberText };
  return { text: 'Step 1 of 3 · Preferences', color: colors.textMuted };
}

export function TripRow({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const status = tripStatus(trip);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${trip.name}. ${status.text}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1 }}>
        <Txt variant="h14" numberOfLines={1}>
          {trip.name}
        </Txt>
        <Txt variant="s11" weight="semibold" color={status.color} style={{ marginTop: 2 }}>
          {status.text}
        </Txt>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...shadow,
  },
});
