import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily } from '@/lib/theme';
import {
  addMonths,
  daysInMonth,
  monthLabel,
  toISO,
  weekdayMon0,
  type ISODate,
  type MonthKey,
} from '../dates';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface CalendarProps {
  month: MonthKey;
  onMonthChange: (month: MonthKey) => void;
  selected: ReadonlySet<ISODate>;
  onPressDay: (date: ISODate) => void;
  /** Days before this can't be picked. */
  minDate?: ISODate;
  hint: string;
  summary?: string;
}

/** Month grid with tap-to-pick days (prototype screen 2, "When are you free?"). */
export function Calendar({ month, onMonthChange, selected, onPressDay, minDate, hint, summary }: CalendarProps) {
  const [y, m] = month.split('-').map(Number);
  const count = daysInMonth(month);
  const lead = weekdayMon0(toISO(y, m, 1));
  const cells: (ISODate | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => toISO(y, m, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const canGoBack = !minDate || addMonths(month, -1) >= minDate.slice(0, 7);

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Txt variant="h14" style={{ fontSize: 13 }}>
          {monthLabel(month)}
        </Txt>
        <View style={styles.arrows}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            disabled={!canGoBack}
            hitSlop={10}
            onPress={() => onMonthChange(addMonths(month, -1))}>
            <Txt variant="h15" color={canGoBack ? colors.textMuted : colors.border}>
              ‹
            </Txt>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            hitSlop={10}
            onPress={() => onMonthChange(addMonths(month, 1))}>
            <Txt variant="h15" color={colors.textMuted}>
              ›
            </Txt>
          </Pressable>
        </View>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((d, i) => (
          <Txt key={i} variant="s11" weight="semibold" style={styles.cellText}>
            {d}
          </Txt>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((date, i) => {
            if (!date) return <View key={i} style={styles.cell} />;
            const on = selected.has(date);
            const past = !!minDate && date < minDate;
            return (
              <Pressable
                key={date}
                style={styles.cell}
                disabled={past}
                onPress={() => onPressDay(date)}
                accessibilityRole="button"
                accessibilityLabel={`${Number(date.slice(8))} ${monthLabel(month)}`}
                accessibilityState={{ selected: on, disabled: past }}>
                <View style={[styles.day, on && styles.dayOn]}>
                  <Txt
                    style={[styles.dayText, on && { fontFamily: fontFamily.bold }]}
                    color={on ? colors.white : past ? '#C2C8D2' : colors.text}>
                    {Number(date.slice(8))}
                  </Txt>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={[styles.head, { marginTop: 8, marginBottom: 0 }]}>
        <Txt variant="s11">{hint}</Txt>
        {summary ? (
          <Txt variant="b12" weight="bold" color={colors.tealDark}>
            {summary}
          </Txt>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 8, paddingHorizontal: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  arrows: { flexDirection: 'row', gap: 18, paddingRight: 2 },
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 33 },
  cellText: { flex: 1, textAlign: 'center' },
  day: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: colors.teal },
  dayText: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 16 },
});
