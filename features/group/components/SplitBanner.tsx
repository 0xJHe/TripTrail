import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { clockOf } from '@/features/planning/stops';
import { useOpenDay } from '@/features/recap/hooks/useOpenDay';
import { useMyMember } from '@/features/trip/hooks/useTrip';
import { useCurrentTrip } from '@/features/trip/store';
import { useGroupLocation } from '@/lib/location';
import { colors, fontFamily, shadow } from '@/lib/theme';
import { firstName } from '../groupMap';
import { useMeetPoints } from '../hooks/useMeetPoints';
import { countdownText, etaTo, meetDirectionsUrl, saveErrorText, splitTitle } from '../meetPoint';

/**
 * While the group is split (Split & rejoin, prototype screen 12): "Split · rejoin at [place]
 * at [time]" with a countdown, on the Map and Today tabs. Group B gets Directions.
 * Group B also gets "+ Add a stop" (their own stops until the rejoin time, features/group/splitStops.ts).
 * "Back together" once both groups are within 50 m of the rejoin point.
 */
export function SplitBanner() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const me = useMyMember(tripId);
  const location = useGroupLocation();
  const { split, time, end } = useMeetPoints(tripId, me?.id ?? null);
  const openDay = useOpenDay(tripId).day;
  const [closed, setClosed] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!split) return null;
  const { row } = split;
  const name = row.name ?? 'the meet point';

  if (split.state === 'together') {
    if (closed === row.id) return null;
    return (
      <View style={[styles.card, styles.green]} testID="split-together" accessibilityRole="alert">
        <View style={styles.head}>
          <View style={[styles.ico, { backgroundColor: colors.green }]}>
            <Ionicons name="people" size={14} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt style={styles.title} color={colors.green}>
              Back together
            </Txt>
            <Txt variant="s11">
              At {name}
              {row.ended_at ? ` · ${clockOf(row.ended_at)}` : ''}
            </Txt>
          </View>
          <Pressable onPress={() => setClosed(row.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    );
  }

  const myId = location?.me && location.source === 'demo' ? location.me.id : me?.id;
  const inB = row.group_b.some((m) => m.id === myId);
  const bNames = row.group_b.map((m) => (m.id === myId ? 'you' : firstName(m.name))).join(', ');
  const at = row.rejoin_at ? Date.parse(row.rejoin_at) : null;
  const mode = location?.me ? etaTo(location.me, row).mode : 'walk';
  const directions = () => Linking.openURL(meetDirectionsUrl(row, mode)).catch(() => {});
  // Group B's own stop: the normal Add a stop screen, ending by the rejoin time.
  const addStop = () =>
    router.push({
      pathname: '/trip/[id]/stop/[stopId]',
      params: { id: tripId!, stopId: 'new', day: String(openDay), split: row.id },
    });
  const stop = async () => {
    setEnding(true);
    setError(null);
    await end(row.id, 'cleared').catch((e) => setError(saveErrorText(e, 'end the split')));
    setEnding(false);
  };

  return (
    <View style={[styles.card, styles.amber]} testID="split-banner">
      <View style={styles.head}>
        <View style={styles.ico}>
          <Ionicons name="git-branch-outline" size={14} color={colors.amber} />
        </View>
        <Txt style={[styles.title, { flex: 1 }]} color={colors.amberText}>
          {splitTitle(row)}
        </Txt>
      </View>
      {at != null ? (
        <View style={styles.line}>
          <Ionicons name="time-outline" size={14} color={colors.navy} />
          <Txt variant="b12" weight="bold">
            Rejoin {countdownText(at, time.getTime())}
          </Txt>
        </View>
      ) : null}
      <Txt variant="b12">
        {inB
          ? `You're in group B: head to ${name}${at != null ? `, arrive by ${clockOf(row.rejoin_at)}` : ''}.`
          : `Group A keeps the plan. Group B (${bNames}) meets you there.`}
      </Txt>
      {inB && tripId && openDay >= 1 ? (
        <Pressable
          onPress={addStop}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Add a stop for group B"
          style={({ pressed }) => [styles.add, pressed && { opacity: 0.6 }]}
          testID="split-add-stop">
          <Ionicons name="add" size={16} color={colors.tealDark} />
          <Txt variant="b12" weight="bold" color={colors.tealDark}>
            Add a stop
          </Txt>
        </Pressable>
      ) : null}
      {error ? (
        <Txt variant="b12" color={colors.red}>
          {error}
        </Txt>
      ) : null}
      <View style={styles.row}>
        {inB ? (
          <Button
            label="Directions"
            size="sm"
            onPress={directions}
            icon={<Ionicons name="navigate" size={15} color={colors.white} />}
            style={styles.half}
          />
        ) : null}
        <Button label="End split" size="sm" variant="secondary" onPress={stop} loading={ending} style={styles.half} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
    backgroundColor: colors.card,
    borderLeftWidth: 5,
    ...shadow,
  },
  amber: { borderLeftColor: colors.amber },
  green: { borderLeftColor: colors.green },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ico: { width: 26, height: 26, borderRadius: 8, backgroundColor: '#FDF3E1', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fontFamily.extrabold, fontSize: 14, lineHeight: 18, letterSpacing: -0.14 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 32 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});
