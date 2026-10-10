import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { Txt } from '@/components/ui/Txt';
import { clockOf, durationText } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { colors, fontFamily, shadow } from '@/lib/theme';
import { firstName } from '../groupMap';
import type { Person } from '../hooks/useMapMembers';
import { meetDirectionsUrl, type Rejoin } from '../meetPoint';

interface SplitPlanCardProps {
  a: Person[];
  b: Person[];
  rejoin: Rejoin<Stop>;
  /** Group A's stops before the rejoin stop. */
  aPlan: Stop[];
}

const names = (people: Person[]) => people.map((p) => (p.isMe ? 'You' : firstName(p.name))).join(', ');
const clock = (ms: number) => clockOf(new Date(ms).toISOString());

/** Both mini-plans and where everyone meets again (prototype screen 12). */
export function SplitPlanCard({ a, b, rejoin, aPlan }: SplitPlanCardProps) {
  const at = clock(rejoin.at);
  const away = rejoin.etaMin === 0 ? 'already there' : `~${durationText(rejoin.etaMin)} ${rejoin.mode === 'walk' ? 'walk' : 'ride'} away`;
  const directions = () => Linking.openURL(meetDirectionsUrl(rejoin.stop, rejoin.mode)).catch(() => {});
  return (
    <View style={styles.card} testID="split-plan">
      <View style={styles.head}>
        <View style={styles.ico}>
          <Ionicons name="git-branch-outline" size={15} color={colors.amber} />
        </View>
        <Txt style={styles.title} color={colors.amberText}>
          Suggested split until {at}
        </Txt>
      </View>

      <View style={styles.opt}>
        <Txt style={styles.who} color={colors.tealDark}>
          Group A · {names(a) || 'nobody yet'}
        </Txt>
        {aPlan.length === 0 ? <Txt variant="b12">Keep to the plan</Txt> : null}
        {aPlan.map((s) => (
          <Line key={s.id} time={clockOf(s.planned_time)} text={s.status === 'arrived' ? `${s.name} · here now` : s.name} />
        ))}
      </View>

      <View style={styles.opt}>
        <Txt style={styles.who} color={colors.amberText}>
          Group B · {names(b) || 'pick someone above'}
        </Txt>
        <Line time="Now" text={`Head to ${rejoin.stop.name}, arrive by ${at}`} />
        <View style={styles.between}>
          <Txt variant="s11" style={{ flex: 1 }}>
            {away} (straight-line estimate)
          </Txt>
          <Chip label="Directions" size="sm" ghost onPress={directions} />
        </View>
      </View>

      <View style={[styles.opt, styles.navy]}>
        <Txt style={styles.who} color="#8FE0D2">
          Everyone · {at}
        </Txt>
        <Txt variant="h14" color={colors.white}>
          {rejoin.stop.name}
        </Txt>
        <Txt variant="s11" color="#C9D8EE" style={{ marginTop: 2 }}>
          {rejoin.inTime
            ? `Group B is ${away}, in time for the ${clockOf(rejoin.stop.planned_time)} start`
            : rejoin.stop.planned_time
              ? `Group B can't make the ${clockOf(rejoin.stop.planned_time)} start, so you rejoin when they get there`
              : `You rejoin when group B gets there (${away})`}
        </Txt>
      </View>

      <Txt variant="s11">Group A keeps the plan. Ends when both groups are within 50 m of {rejoin.stop.name}.</Txt>
    </View>
  );
}

function Line({ time, text }: { time: string; text: string }) {
  return (
    <View style={styles.line}>
      <Txt variant="b12" weight="semibold" color={colors.textMuted} style={styles.time}>
        {time}
      </Txt>
      <Txt variant="b12" style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
    backgroundColor: colors.card,
    borderLeftWidth: 5,
    borderLeftColor: colors.amber,
    ...shadow,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ico: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#FDF3E1', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: fontFamily.extrabold, fontSize: 15, lineHeight: 20, letterSpacing: -0.15 },
  opt: { borderRadius: 12, backgroundColor: colors.background, paddingVertical: 10, paddingHorizontal: 12, gap: 3 },
  navy: { backgroundColor: colors.navy },
  who: { fontFamily: fontFamily.bold, fontSize: 11, lineHeight: 15, marginBottom: 3 },
  line: { flexDirection: 'row', alignItems: 'flex-start' },
  time: { width: 44 },
  between: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
});
