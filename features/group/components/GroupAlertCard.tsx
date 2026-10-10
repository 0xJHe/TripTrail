import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily, shadow } from '@/lib/theme';
import { farText, lowBatteryText, type FarMember, type MapMember } from '../groupMap';
import type { MapNotice } from '../hooks/useGroupMap';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface GroupAlertCardProps {
  far: FarMember[];
  low: MapMember[];
  sharingCount: number;
  groupSize: number;
  notice: MapNotice;
  onAllow: () => void;
}

/**
 * The card under the map (prototype screen 11): amber stripe when someone is far from the
 * group or their battery is low, else how many are sharing. Meet point and Split & rejoin
 * come in the next step, so they show greyed out.
 */
export function GroupAlertCard({ far, low, sharingCount, groupSize, notice, onAllow }: GroupAlertCardProps) {
  if (notice.kind !== 'live') return <NoticeCard notice={notice} onAllow={onAllow} />;
  const alert = far.length > 0 || low.length > 0;
  // The headline is the first far member, else the lowest battery; the rest go underneath.
  const [headline, ...rest] = [
    ...far.map((f) => ({ key: `far-${f.member.id}`, icon: 'warning-outline' as IconName, text: farText(f), battery: false })),
    ...low.map((m) => ({ key: `low-${m.id}`, icon: 'battery-dead-outline' as IconName, text: lowBatteryText(m), battery: true })),
  ];
  return (
    <View style={[styles.card, alert ? styles.amber : styles.calm]} testID="group-alert" accessibilityRole={alert ? 'alert' : undefined}>
      {headline ? (
        <View style={styles.head} accessibilityRole="header">
          <View style={styles.ico}>
            <Ionicons name={headline.icon} size={14} color={colors.amber} />
          </View>
          <Txt style={[styles.title, { flex: 1 }]} color={colors.amberText}>
            {headline.text}
          </Txt>
        </View>
      ) : (
        <View style={styles.head}>
          <View style={[styles.ico, { backgroundColor: colors.tealTint }]}>
            <Ionicons name="people-outline" size={14} color={colors.tealDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt style={styles.title}>{sharingCount > 1 ? 'Everyone is together' : 'Your group shows here'}</Txt>
            <Txt variant="s11">
              {sharingCount > 0 ? `${sharingCount} of ${Math.max(groupSize, sharingCount)} sharing location` : 'Waiting for positions…'}
            </Txt>
          </View>
        </View>
      )}
      {rest.map((line) => (
        <View key={line.key} style={styles.line}>
          <Ionicons name={line.icon} size={14} color={line.battery ? colors.red : colors.amber} />
          <Txt variant="b12" weight="semibold" color={line.battery ? colors.red : colors.amberText} style={{ flex: 1 }}>
            {line.text}
          </Txt>
        </View>
      ))}
      <View style={styles.row}>
        <Button label="Set meet point" size="sm" disabled style={styles.half} />
        <Button label="Split & rejoin" size="sm" variant="secondary" disabled style={[styles.half, styles.offSecondary]} />
      </View>
      <Txt variant="s11" style={{ textAlign: 'center' }}>
        Meet point and Split & rejoin are coming soon
      </Txt>
    </View>
  );
}

/** [title, line] for each notice. */
function noticeText(notice: Exclude<MapNotice, { kind: 'live' }>): [string, string] {
  switch (notice.kind) {
    case 'not-trip-day':
      return ['Group map is off today', "Positions show here during the trip, from 1 hour before the day's first stop."];
    case 'later':
      return ['Location sharing starts later', `From ${notice.at}, 1 hour before ${notice.firstStop}.`];
    case 'over':
      return ['Location sharing is off for tonight', "It turns back on 1 hour before tomorrow's first stop."];
    case 'no-permission':
      return [
        'Turn on location to share it with your group',
        notice.blocked
          ? 'Location is off for TripTrail. Turn it on in your phone settings.'
          : 'Your group sees where you are only while the app is open on a trip day.',
      ];
  }
}

/** Not a live moment: not a trip day, too early, over for the night, or location off. */
function NoticeCard({ notice, onAllow }: { notice: Exclude<MapNotice, { kind: 'live' }>; onAllow: () => void }) {
  const text = noticeText(notice);
  return (
    <View style={[styles.card, styles.calm]} testID="group-notice">
      <View style={styles.head}>
        <View style={[styles.ico, { backgroundColor: colors.chip }]}>
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt style={styles.title}>{text[0]}</Txt>
          <Txt variant="s11">{text[1]}</Txt>
        </View>
      </View>
      {notice.kind === 'no-permission' ? (
        <Button label={notice.blocked ? 'Open settings' : 'Turn on location'} size="sm" onPress={onAllow} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    backgroundColor: colors.card,
    borderLeftWidth: 5,
    ...shadow,
  },
  amber: { borderLeftColor: colors.amber },
  calm: { borderLeftColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ico: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#FDF3E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fontFamily.extrabold, fontSize: 14, lineHeight: 18, letterSpacing: -0.14 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  offSecondary: { opacity: 0.5 },
});
