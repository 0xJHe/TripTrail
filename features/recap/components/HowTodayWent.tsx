import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';
import type { DayReview, ReviewMark, ReviewRow } from '../dayEnd';

type IconName = ComponentProps<typeof Ionicons>['name'];

const MARKS: Record<ReviewMark, { icon: IconName; color: string; tint: string; label: string }> = {
  done: { icon: 'checkmark', color: colors.green, tint: '#E3F4EA', label: 'Visited' },
  late: { icon: 'alert', color: colors.red, tint: '#FBE7E7', label: 'Visited late' },
  missed: { icon: 'close', color: colors.textMuted, tint: colors.chip, label: 'Not visited' },
};

/** "How today went": every stop of the day, planned (left) vs what happened (right), with totals. */
export function HowTodayWent({ review }: { review: DayReview }) {
  return (
    <Card style={styles.card} testID="how-today-went">
      <View style={styles.between}>
        <Txt variant="sec">How today went</Txt>
        <Txt variant="s11">
          {review.visited} of {review.total} stops
        </Txt>
      </View>
      {review.rows.map((row) => (
        <Row key={row.id} row={row} />
      ))}
      <View style={[styles.between, styles.total]}>
        <Txt variant="b12" weight="semibold">
          Planned {review.planned}
        </Txt>
        <Txt variant="b12" weight="bold">
          Spent {review.spent}
        </Txt>
      </View>
    </Card>
  );
}

function Row({ row }: { row: ReviewRow }) {
  const mark = MARKS[row.mark];
  const actualColor = row.mark === 'late' ? colors.red : row.mark === 'missed' ? colors.textMuted : colors.text;
  return (
    <View style={styles.row} accessibilityLabel={`${row.name}: ${mark.label}. ${row.planned}. ${row.actual}`}>
      <View style={[styles.mark, { backgroundColor: mark.tint }]}>
        <Ionicons name={mark.icon} size={13} color={mark.color} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="b12" weight="semibold" style={row.struck && styles.struck} color={row.struck ? colors.textMuted : undefined}>
          {row.name}
        </Txt>
        <Txt variant="s11" style={row.struck && styles.struck}>
          {row.planned}
        </Txt>
      </View>
      <View style={styles.right}>
        <Txt variant="s11" weight="bold" color={actualColor}>
          {row.late ? `${row.actual} · ${row.late}` : row.actual}
        </Txt>
        {row.spent ? <Txt variant="s11">{row.spent}</Txt> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 9, paddingVertical: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  mark: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  right: { alignItems: 'flex-end', gap: 1, maxWidth: '45%' },
  struck: { textDecorationLine: 'line-through' },
  total: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9 },
});
