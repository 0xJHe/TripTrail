import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { clockOf, priceLabel } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { colors, fontFamily } from '@/lib/theme';
import type { WeatherText } from '../weather';
import { WeatherLine } from './WeatherLine';

type NowCardProps =
  /** The group is at this stop. */
  | { kind: 'at'; stop: Stop; weather: WeatherText | null; onDone: () => void; onPin: () => void; leaving: boolean }
  /** Between stops: on the way to this one. */
  | { kind: 'heading'; stop: Stop; weather: WeatherText | null; onPin: () => void }
  /** Every stop of the day is behind them. */
  | { kind: 'finished'; visited: number };

/** The navy "Now" block (prototype .now). */
export function NowCard(props: NowCardProps) {
  return (
    <LinearGradient
      colors={[colors.navy, colors.navyMid, colors.navyTeal]}
      locations={[0, 0.6, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1.3 }}
      style={styles.now}
      testID="now-card">
      {props.kind === 'finished' ? (
        <>
          <Txt style={styles.k} color={KICKER}>
            Today
          </Txt>
          <Txt variant="h22" color={colors.white}>
            That's every stop for today
          </Txt>
          <Txt style={styles.meta} color={META}>
            {props.visited === 1 ? '1 stop visited' : `${props.visited} stops visited`}. Enjoy the evening!
          </Txt>
        </>
      ) : (
        <StopBody {...props} />
      )}
    </LinearGradient>
  );
}

function StopBody(props: Extract<NowCardProps, { stop: Stop }>) {
  const { stop } = props;
  const until = clockOf(stop.planned_end);
  const line =
    props.kind === 'at'
      ? [`Arrived ${clockOf(stop.arrived_at)}`, until && `until ${until}`, priceLabel(stop)]
      : [stop.planned_time && `Starts ${clockOf(stop.planned_time)}`, priceLabel(stop)];
  return (
    <>
      <Txt style={styles.k} color={KICKER}>
        {props.kind === 'at' ? 'Now' : 'On the way to'}
      </Txt>
      <Txt variant="h22" color={colors.white}>
        {stop.name}
      </Txt>
      {stop.address ? (
        <Txt style={styles.meta} color={META}>
          {stop.address}
        </Txt>
      ) : null}
      <Txt style={styles.meta} color={META}>
        {line.filter(Boolean).join(' · ')}
      </Txt>
      {props.weather ? (
        <View style={{ marginTop: 2 }}>
          <WeatherLine weather={props.weather} onNavy />
        </View>
      ) : null}
      <View style={styles.pills}>
        {props.kind === 'at' ? (
          <>
            <Pill label="We're done here" onPress={props.onDone} busy={props.leaving} />
            <Pill label="📍 Pin spot" onPress={props.onPin} ghost />
          </>
        ) : (
          <Pill label="📍 Pin spot" onPress={props.onPin} ghost />
        )}
      </View>
    </>
  );
}

function Pill({ label, onPress, busy, ghost }: { label: string; onPress: () => void; busy?: boolean; ghost?: boolean }) {
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label.replace('📍 ', '')}
      accessibilityState={{ busy: !!busy }}
      style={({ pressed }) => [styles.pill, ghost && styles.ghost, pressed && { opacity: 0.85 }]}>
      {busy ? <ActivityIndicator color={colors.white} size="small" /> : null}
      <Txt style={styles.pillText} color={colors.white}>
        {label}
      </Txt>
    </Pressable>
  );
}

const KICKER = '#8FE0D2';
const META = '#C9D8EE';

const styles = StyleSheet.create({
  now: {
    borderRadius: 18,
    padding: 16,
    gap: 6,
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 4,
  },
  k: { fontFamily: fontFamily.bold, fontSize: 11, lineHeight: 14 },
  meta: { fontSize: 12.5, lineHeight: 17 },
  pills: { flexDirection: 'row', gap: 8, marginTop: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.teal,
  },
  ghost: { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  pillText: { fontFamily: fontFamily.bold, fontSize: 12.5, lineHeight: 16 },
});
