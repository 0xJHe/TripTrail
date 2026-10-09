import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { durationText } from '@/features/planning/stops';
import { colors, fontFamily, formatMoney, shadow } from '@/lib/theme';
import type { RainOption } from '@/supabase/functions/_shared/nearby';
import type { RainState } from '../hooks/useRainAlert';
import { rainHeadline } from '../rain';

/** "6 min walk · ~RM 10", "9 min ride · Free". */
export function rainOptionMeta(o: RainOption): string {
  return [`${durationText(o.walkMin)} ${o.ride ? 'ride' : 'walk'}`, o.price > 0 ? formatMoney(o.price, true) : 'Free'].join(' · ');
}

/**
 * Rain backup (prototype screen 10): rain is coming at an outdoor stop. Up to 3 nearby
 * indoor places within budget, each with Go (swaps it in for the stop, same time slot, for
 * everyone), and a Keep plan link. Nothing found: "consider moving it" and Keep plan only.
 */
export function RainCard({ rain }: { rain: RainState }) {
  const { alert, stop } = rain;
  if (!alert || !stop) return null;
  const busy = rain.deciding != null;
  const options = alert.options ?? [];

  return (
    <View style={styles.card} testID="rain-card">
      <View style={styles.head} accessibilityRole="header">
        <View style={styles.ico}>
          <Ionicons name="umbrella-outline" size={17} color={colors.blue} />
        </View>
        <Txt style={styles.title} color={BLUE_TEXT}>
          {rainHeadline(stop.name, rain.minutes, options.length > 0)}
        </Txt>
      </View>

      {options.length > 0 ? (
        <>
          <Txt variant="b12" weight="bold">
            Nearby, indoor, within budget
          </Txt>
          {options.map((o) => (
            <View key={o.placeId} style={styles.opt} accessibilityLabel={`Indoor option: ${o.name}`}>
              <View style={styles.optText}>
                <Txt variant="h14" style={styles.optTitle}>
                  {o.name}
                </Txt>
                <Txt variant="s11">{rainOptionMeta(o)}</Txt>
                {o.halalNote ? (
                  <Txt variant="s11" color={colors.amberText}>
                    Halal-friendly · not verified
                  </Txt>
                ) : null}
              </View>
              <Button
                size="sm"
                label="Go"
                onPress={() => rain.go(o)}
                loading={rain.deciding === o.placeId}
                disabled={busy}
                style={styles.go}
                testID={`rain-go-${o.placeId}`}
              />
            </View>
          ))}
        </>
      ) : (
        <Txt variant="b12">Nothing indoor nearby fits the budget. You could move {stop.name} to another time on the Plan tab.</Txt>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Keep plan"
        onPress={busy ? undefined : rain.keep}
        hitSlop={8}
        style={styles.keep}>
        <Txt variant="b12" weight="semibold" color={busy ? colors.disabled : colors.tealDark}>
          {rain.deciding === 'keep' ? 'Keeping the plan…' : 'Keep plan'}
        </Txt>
      </Pressable>
      {rain.note ? <Txt variant="s11">{rain.note}</Txt> : null}
    </View>
  );
}

const BLUE_TEXT = '#2F6BC0';
const BLUE_TINT = '#E8F0FB';

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderLeftWidth: 5,
    borderLeftColor: colors.blue,
    padding: 14,
    gap: 10,
    ...shadow,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ico: { width: 30, height: 30, borderRadius: 9, backgroundColor: BLUE_TINT, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: fontFamily.extrabold, fontSize: 16, lineHeight: 21, letterSpacing: -0.16 },
  opt: {
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optText: { flex: 1, gap: 2 },
  optTitle: { fontSize: 13, lineHeight: 17 },
  go: { minWidth: 56, paddingHorizontal: 14 },
  keep: { alignSelf: 'center', paddingVertical: 2 },
});
