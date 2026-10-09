import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { clockOf, priceLabel } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { colors } from '@/lib/theme';
import { directionsUrl } from '../todayPlan';
import type { WeatherText } from '../weather';
import { WeatherLine } from './WeatherLine';

/** The next stop: "14:00 · Chulia Street street food", price · forecast, and a directions pin. */
export function NextCard({ stop, weather }: { stop: Stop; weather: WeatherText | null }) {
  return (
    <Card testID="next-card">
      <NextLine stop={stop} weather={weather} />
    </Card>
  );
}

/** The inside of the Next card (also shown at the bottom of the running-late card). */
export function NextLine({ stop, weather }: { stop: Stop; weather: WeatherText | null }) {
  const time = clockOf(stop.planned_time);
  const title = time ? `${time} · ${stop.name}` : stop.name;
  return (
    <View style={styles.between}>
      <View style={{ flex: 1 }}>
        <Txt variant="h14">{title}</Txt>
        <View style={styles.meta}>
          <Txt variant="s11">{priceLabel(stop)}</Txt>
          {weather ? (
            <>
              <Txt variant="s11">·</Txt>
              <WeatherLine weather={weather} />
            </>
          ) : null}
        </View>
      </View>
      <Pressable
        onPress={() => Linking.openURL(directionsUrl(stop)).catch(() => {})}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Directions to ${stop.name}`}
        style={({ pressed }) => pressed && { opacity: 0.6 }}>
        <Ionicons name="location-outline" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

/**
 * A finished stop: "09:30 Penang Hill funicular · RM 15" with a tick (prototype screen 9).
 * `cost` is the final cost once the spend check is answered ("RM 18"), else the estimate;
 * `soFar` the group's "Spent so far RM 52 · 3 of 4".
 */
export function DoneRow({ stop, cost, soFar }: { stop: Stop; cost: string; soFar?: string | null }) {
  return (
    <Card style={[styles.between, styles.done]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="b12" color={colors.textMuted}>
          {`${clockOf(stop.planned_time)} ${stop.name}`.trim()} · {cost}
        </Txt>
        {soFar ? <Txt variant="s11">{soFar}</Txt> : null}
      </View>
      <Ionicons name="checkmark" size={18} color={colors.green} accessibilityLabel="Done" />
    </Card>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  done: { paddingVertical: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 3 },
});
