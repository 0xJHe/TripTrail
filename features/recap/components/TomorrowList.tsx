import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { clockOf, priceLabel } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { longDate } from '@/features/today/todayPlan';
import { colors, fontFamily } from '@/lib/theme';

interface TomorrowListProps {
  day: number;
  date: string;
  stops: Stop[];
  onEdit: (stopId: string) => void;
  onAdd: () => void;
}

/** "Tomorrow · Day 2": the next day's stops, each with Edit, and Add a stop. */
export function TomorrowList({ day, date, stops, onEdit, onAdd }: TomorrowListProps) {
  return (
    <>
      <View style={styles.between}>
        <Txt variant="sec">Tomorrow · Day {day}</Txt>
        <Txt variant="s11">{longDate(date)}</Txt>
      </View>
      {stops.length === 0 ? <Txt variant="s11">Nothing planned yet.</Txt> : null}
      {stops.map((s) => (
        <Card key={s.id} style={[styles.between, styles.stop]}>
          <View style={{ flex: 1 }}>
            <Txt variant="h14" style={{ fontSize: 13 }}>
              {s.name}
            </Txt>
            <Txt variant="s11">{[clockOf(s.planned_time), priceLabel(s)].filter(Boolean).join(' · ')}</Txt>
          </View>
          <Pressable
            onPress={() => onEdit(s.id)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${s.name}`}
            hitSlop={8}
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
            <Txt style={styles.chipText}>Edit</Txt>
          </Pressable>
        </Card>
      ))}
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Add a stop for tomorrow"
        testID="tomorrow-add-stop"
        style={({ pressed }) => [styles.add, pressed && { backgroundColor: colors.tealTint }]}>
        <Ionicons name="add" size={18} color={colors.tealDark} />
        <Txt style={styles.addText} color={colors.tealDark}>
          Add a stop
        </Txt>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stop: { paddingVertical: 10, paddingHorizontal: 12 },
  chip: { backgroundColor: colors.chip, borderRadius: 999, paddingHorizontal: 12, minHeight: 30, justifyContent: 'center' },
  chipText: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16, color: colors.text },
  add: {
    minHeight: 44,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.disabled,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addText: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 17 },
});
