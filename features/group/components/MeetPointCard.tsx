import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { clockOf } from '@/features/planning/stops';
import { colors, fontFamily, shadow } from '@/lib/theme';
import { firstName, type MapMember } from '../groupMap';
import { etaText, etaTo, meetDirectionsUrl, SPOT_NAME, type Gathering } from '../meetPoint';

interface MeetPointCardProps {
  meet: Gathering;
  members: MapMember[];
  /** "Aisha", "You". */
  setBy: string;
  onClear: () => void;
  onClose: () => void;
  /** Clearing failed. */
  error?: string | null;
}

/**
 * The meet point under the map: each member's free estimate to get there, Directions
 * (Google Maps, walking) and Clear. "Everyone's here" once all are within 50 m.
 */
export function MeetPointCard({ meet, members, setBy, onClear, onClose, error }: MeetPointCardProps) {
  const { row } = meet;
  const name = row.name ?? SPOT_NAME;

  if (meet.state === 'together') {
    return (
      <View style={[styles.card, styles.green]} testID="meet-together" accessibilityRole="alert">
        <View style={styles.head}>
          <View style={[styles.ico, { backgroundColor: colors.green }]}>
            <Ionicons name="checkmark" size={15} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt style={styles.title} color={colors.green}>
              Everyone's here
            </Txt>
            <Txt variant="s11">
              At {name}
              {row.ended_at ? ` · ${clockOf(row.ended_at)}` : ''}
            </Txt>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    );
  }

  const me = members.find((m) => m.isMe);
  const myEta = me ? etaTo(me, row) : null;
  const sorted = [...members].sort((a, b) => Number(b.isMe) - Number(a.isMe));
  const directions = () => Linking.openURL(meetDirectionsUrl(row, 'walk')).catch(() => {});

  return (
    <View style={[styles.card, styles.navy]} testID="meet-card">
      <View style={styles.head}>
        <View style={[styles.ico, { backgroundColor: colors.navy }]}>
          <Ionicons name="flag" size={14} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt style={styles.title} numberOfLines={1}>
            Meet at {name}
          </Txt>
          <Txt variant="s11">
            Set by {setBy} · {clockOf(row.set_at)}
          </Txt>
        </View>
      </View>
      {sorted.length === 0 ? <Txt variant="s11">Waiting for positions…</Txt> : null}
      {sorted.map((m) => {
        const eta = etaTo(m, row);
        return (
          <View key={m.id} style={styles.line}>
            <Txt variant="b12" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
              {m.isMe ? 'You' : firstName(m.name)}
            </Txt>
            {eta.minutes === 0 ? <Ionicons name="checkmark-circle" size={14} color={colors.green} /> : null}
            <Txt variant="b12" color={eta.minutes === 0 ? colors.green : colors.textMuted}>
              {etaText(eta)}
            </Txt>
          </View>
        );
      })}
      <Txt variant="s11">Straight-line estimate · clears when everyone is within 50 m</Txt>
      {error ? (
        <Txt variant="b12" color={colors.red}>
          {error}
        </Txt>
      ) : null}
      <View style={styles.row}>
        <Button
          label="Directions"
          size="sm"
          onPress={directions}
          disabled={myEta?.minutes === 0}
          icon={<Ionicons name="navigate" size={15} color={colors.white} />}
          style={styles.half}
        />
        <Button label="Clear" size="sm" variant="secondary" onPress={onClear} style={styles.half} />
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
  navy: { borderLeftColor: colors.navy },
  green: { borderLeftColor: colors.green },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ico: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fontFamily.extrabold, fontSize: 14, lineHeight: 18, letterSpacing: -0.14 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', gap: 10, marginTop: 2 },
  half: { flex: 1 },
});
