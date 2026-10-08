import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { clockOf, durationText } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { colors, fontFamily, formatMoney, shadow } from '@/lib/theme';
import { WALK_UNDER_M, type NearbySuggestion } from '@/supabase/functions/_shared/nearby';
import { aheadOf } from '../early';
import type { EarlyState } from '../hooks/useEarlyAlert';

interface EarlyCardProps {
  early: EarlyState;
  /** The stop the group is heading to. */
  stop: Stop;
  /** The stop the group just left (for "The group left Kek Lok Si at 12:50."). */
  left: Stop | null;
}

/** "You're 40 minutes ahead", "You're 1 h 15 min ahead"; null minutes = no planned end to compare with. */
export const aheadText = (minutes: number | null) =>
  minutes == null ? "You're ahead of the plan" : `You're ${durationText(minutes, true)} ahead`;

/** "5 min walk · ~RM 15 · within everyone's budget". */
export function suggestionMeta(s: NearbySuggestion): string {
  return [
    // Further than a walk (the wider 2 km search): the time is a ride, as legMinutes works it out.
    `${durationText(s.walkMin)} ${s.distanceM < WALK_UNDER_M ? 'walk' : 'ride'}`,
    s.price > 0 ? formatMoney(s.price, true) : 'Free',
    s.withinBudget ? "within everyone's budget" : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Running early (prototype screen 8): the spare time, one nearby place to fill it, and
 * Add this / Go to next stop. "Go to next stop" then offers to move the next stop earlier.
 */
export function EarlyCard({ early, stop, left }: EarlyCardProps) {
  const { alert, move } = early;
  if (!alert) return null;
  const busy = early.deciding != null;
  const leftLine = left && alert.left_at ? `The group left ${left.name} at ${clockOf(alert.left_at)}.` : null;
  const s = alert.suggestion;

  return (
    <View style={styles.card} testID="early-card">
      <View style={styles.head} accessibilityRole="header">
        <View style={styles.ico}>
          <Ionicons name="time-outline" size={17} color={colors.green} />
        </View>
        <Txt style={styles.title} color={GREEN_TEXT}>
          {aheadText(aheadOf(left, alert.left_at))}
        </Txt>
      </View>
      {leftLine ? <Txt variant="b12">{leftLine}</Txt> : null}

      {alert.status === 'offer' ? (
        <>
          <Txt variant="b12">
            {move
              ? `Move ${stop.name} from ${clockOf(stop.planned_time)} to ${clockOf(move.planned_time)}?`
              : `No time left to gain: ${stop.name} stays at ${clockOf(stop.planned_time)}.`}
          </Txt>
          <View style={styles.buttons}>
            {move ? (
              <Button
                size="sm"
                label={`Move to ${clockOf(move.planned_time)}`}
                onPress={early.acceptMove}
                loading={early.deciding === 'move'}
                disabled={busy}
                style={styles.button}
              />
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              label={move ? `Keep ${clockOf(stop.planned_time)}` : 'OK'}
              onPress={early.keep}
              loading={early.deciding === 'keep'}
              disabled={busy}
              style={styles.button}
            />
          </View>
        </>
      ) : (
        <>
          {s ? (
            <>
              <Txt variant="lbl" color={colors.text}>
                Fill the gap?
              </Txt>
              <View style={styles.opt} accessibilityLabel={`Suggestion: ${s.name}`}>
                <Txt variant="h14" style={styles.optTitle}>
                  {s.name}
                </Txt>
                <Txt variant="s11">{s.reason}</Txt>
                <Txt variant="s11">{suggestionMeta(s)}</Txt>
                {s.halalNote ? (
                  <Txt variant="s11" color={colors.amberText}>
                    Halal-friendly · not verified
                  </Txt>
                ) : null}
              </View>
            </>
          ) : (
            <View style={styles.opt}>
              <Txt variant="h14" style={styles.optTitle}>
                Enjoy the extra time
              </Txt>
              <Txt variant="s11">Nothing nearby fits the time and budget, so take it easy on the way.</Txt>
            </View>
          )}
          <View style={styles.buttons}>
            {s ? (
              <Button
                size="sm"
                label="Add this"
                onPress={early.add}
                loading={early.deciding === 'add'}
                disabled={busy}
                style={styles.button}
              />
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              label="Go to next stop"
              onPress={early.goNext}
              loading={early.deciding === 'next'}
              disabled={busy}
              style={styles.button}
            />
          </View>
        </>
      )}
      {early.note ? <Txt variant="s11">{early.note}</Txt> : null}
    </View>
  );
}

const GREEN_TEXT = '#218A4E';
const GREEN_TINT = '#E6F7EC';

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderLeftWidth: 5,
    borderLeftColor: colors.green,
    padding: 14,
    gap: 10,
    ...shadow,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ico: { width: 30, height: 30, borderRadius: 9, backgroundColor: GREEN_TINT, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: fontFamily.extrabold, fontSize: 16, lineHeight: 21, letterSpacing: -0.16 },
  opt: { backgroundColor: colors.background, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  optTitle: { fontSize: 13, lineHeight: 17 },
  buttons: { flexDirection: 'row', gap: 10 },
  button: { flex: 1 },
});
