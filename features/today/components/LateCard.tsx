import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { clockOf, durationText } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { colors, fontFamily, formatMoney, shadow } from '@/lib/theme';
import type { LateState } from '../hooks/useLateAlert';
import type { WeatherText } from '../weather';
import { NewDayList } from './NewDayList';
import { NextLine } from './StopLines';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface LateCardProps {
  late: LateState;
  /** The stop they might be late for. */
  stop: Stop;
  time: Date;
  /** Show the stop as "Next" at the bottom (when the group is at a stop, as in the prototype). */
  next: { weather: WeatherText | null } | null;
}

/** "Cost change RM 0", "Cost change −RM 12". */
export function costText(change: number): string {
  if (change === 0) return 'Cost change RM 0';
  return `Cost change ${change < 0 ? '−' : '+'}${formatMoney(Math.abs(change))}`;
}

/** Running late (prototype screen 7): the times, a suggested new day, and Accept / Keep original. */
export function LateCard({ late, stop, time, next }: LateCardProps) {
  const { alert, plan } = late;
  if (!alert || !plan) return null;
  return (
    <View style={styles.card} testID="late-card">
      <View style={styles.body}>
        <View style={styles.head} accessibilityRole="header">
          <View style={styles.ico}>
            <Ionicons name="warning-outline" size={15} color={colors.red} />
          </View>
          <Txt style={styles.title} color={colors.red}>
            Might be late for {stop.name}
          </Txt>
        </View>

        <View style={styles.tiles}>
          <Tile icon="time-outline" label="Now" value={clockOf(time.toISOString())} />
          <Tile icon="car-outline" label="Travel" value={durationText(alert.travel_min)} />
          <Tile icon="calendar-outline" label="Starts" value={clockOf(stop.planned_time)} />
        </View>

        <NewDayList plan={plan} />

        <Txt variant="b12" weight="bold" color={plan.costChange > 0 ? colors.red : colors.green}>
          {costText(plan.costChange)}
        </Txt>
        <View style={styles.buttons}>
          <Button
            size="sm"
            label="Accept new day"
            onPress={late.accept}
            loading={late.deciding === 'accept'}
            disabled={late.deciding != null}
            style={styles.button}
          />
          <Button
            size="sm"
            variant="secondary"
            label="Keep original"
            onPress={late.keep}
            loading={late.deciding === 'keep'}
            disabled={late.deciding != null}
            style={styles.button}
          />
        </View>
        {late.note ? <Txt variant="s11">{late.note}</Txt> : null}
      </View>

      {next ? (
        <View style={styles.next}>
          <Txt variant="lbl" style={{ marginBottom: 4 }}>
            Next
          </Txt>
          <NextLine stop={stop} weather={next.weather} />
        </View>
      ) : null}
    </View>
  );
}

function Tile({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.tile} accessibilityLabel={`${label} ${value}`}>
      <Ionicons name={icon} size={15} color={colors.red} />
      <View>
        <Txt variant="s11" color={colors.red}>
          {label}
        </Txt>
        <Txt variant="h14" color={colors.red} style={styles.tileValue}>
          {value}
        </Txt>
      </View>
    </View>
  );
}

const RED_TINT = '#FDEDEB';

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderLeftWidth: 5,
    borderLeftColor: colors.red,
    overflow: 'hidden',
    ...shadow,
  },
  body: { paddingVertical: 12, paddingHorizontal: 14, gap: 9 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ico: { width: 26, height: 26, borderRadius: 8, backgroundColor: RED_TINT, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: fontFamily.extrabold, fontSize: 15, lineHeight: 20, letterSpacing: -0.15 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: RED_TINT,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tileValue: { fontSize: 13, lineHeight: 17 },
  buttons: { flexDirection: 'row', gap: 10 },
  button: { flex: 1 },
  next: { borderTopWidth: 1, borderTopColor: RED_TINT, backgroundColor: '#FFF9F8', paddingTop: 11, paddingHorizontal: 14, paddingBottom: 14 },
});
