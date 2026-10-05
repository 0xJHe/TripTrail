import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { clockOf, priceLabel } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { colors } from '@/lib/theme';
import { directionsUrl } from '../todayPlan';

/** The next stop: "14:00 · Chulia Street street food", price, and a directions pin. */
export function NextCard({ stop }: { stop: Stop }) {
  const time = clockOf(stop.planned_time);
  const title = time ? `${time} · ${stop.name}` : stop.name;
  return (
    <Card style={styles.between} testID="next-card">
      <View style={{ flex: 1 }}>
        <Txt variant="h14">{title}</Txt>
        <Txt variant="s11" style={{ marginTop: 3 }}>
          {priceLabel(stop)}
        </Txt>
      </View>
      <Pressable
        onPress={() => Linking.openURL(directionsUrl(stop)).catch(() => {})}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Directions to ${stop.name}`}
        style={({ pressed }) => pressed && { opacity: 0.6 }}>
        <Ionicons name="location-outline" size={20} color={colors.textMuted} />
      </Pressable>
    </Card>
  );
}

/** A finished stop: "09:30 Penang Hill funicular · arrived 09:34 · left 10:50" with a tick. */
export function DoneRow({ stop }: { stop: Stop }) {
  const parts = [
    `${clockOf(stop.planned_time)} ${stop.name}`.trim(),
    stop.arrived_at && `arrived ${clockOf(stop.arrived_at)}`,
    stop.left_at && `left ${clockOf(stop.left_at)}`,
  ];
  return (
    <Card style={[styles.between, styles.done]}>
      <Txt variant="b12" color={colors.textMuted} style={{ flex: 1 }}>
        {parts.filter(Boolean).join(' · ')}
      </Txt>
      <Ionicons name="checkmark" size={18} color={colors.green} accessibilityLabel="Done" />
    </Card>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  done: { paddingVertical: 10 },
});
