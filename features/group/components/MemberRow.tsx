import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatars } from '@/components/ui/Avatars';
import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily, radius } from '@/lib/theme';
import { batteryText, isLowBattery, locationText, type GroupRow } from '../groupList';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** One member: avatar, name, You / Organiser / Demo tags, then location · battery. */
export function MemberRow({ row }: { row: GroupRow }) {
  const loc = row.location;
  const battery = batteryText(row.battery);
  const low = isLowBattery(row.battery);
  const locIcon: IconName =
    loc.kind === 'sharing' ? 'location' : loc.kind === 'done' ? 'moon-outline' : loc.kind === 'last-seen' ? 'time-outline' : 'location-outline';
  const locColor = loc.kind === 'sharing' ? colors.tealDark : colors.textMuted;
  return (
    <View style={styles.row} testID={`member-${row.id}`}>
      <Avatars people={[{ key: row.id, name: row.name, color: row.color, muted: loc.kind === 'done' }]} size={38} />
      <View style={styles.body}>
        <View style={styles.nameLine}>
          <Txt variant="h14" numberOfLines={1} style={styles.name}>
            {row.name}
          </Txt>
          {row.isMe ? <Tag text="You" color={colors.tealDark} bg={colors.tealTint} /> : null}
          {row.organiser ? <Tag text="Organiser" color={colors.white} bg={colors.navy} /> : null}
          {row.demo ? <Tag text="Demo" color={colors.textMuted} bg={colors.chip} /> : null}
        </View>
        <View style={styles.status}>
          <Status icon={locIcon} color={locColor} text={locationText(loc)} />
          {battery && loc.kind !== 'done' ? (
            <Status
              icon={low ? 'battery-dead' : 'battery-half'}
              color={low ? colors.amberText : colors.textMuted}
              text={low ? `${battery} · low` : battery}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Tag({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Txt style={styles.tagText} color={color}>
        {text}
      </Txt>
    </View>
  );
}

function Status({ icon, color, text }: { icon: IconName; color: string; text: string }) {
  return (
    <View style={styles.statusItem}>
      <Ionicons name={icon} size={12} color={color} />
      <Txt variant="s11" color={color}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  body: { flex: 1, gap: 3 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { flexShrink: 1 },
  tag: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
  tagText: { fontFamily: fontFamily.semibold, fontSize: 10, lineHeight: 14 },
  status: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2 },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
