import { StyleSheet, View } from 'react-native';

import { Avatars } from '@/components/ui/Avatars';
import { Txt } from '@/components/ui/Txt';
import { memberAvatars } from '@/features/trip/members';
import type { Member } from '@/features/trip/types';
import { colors, fontFamily, formatMoney, radius, shadow } from '@/lib/theme';
import { freeLabelShort } from '../dateFinder';
import { formatRange } from '../dates';
import type { OptionResult } from '../tally';
import { Scene } from './Scene';

/** The winning trip, outlined in teal (prototype screen 4). */
export function WinnerCard({ result, members, decided }: { result: OptionResult; members: Member[]; decided: boolean }) {
  const { option, likes, likerIds, fit } = result;
  const days = option.plan_json.days;
  const when = fit.window ? ` · ${formatRange(fit.window.start, fit.window.end)} · ${freeLabelShort(fit.window)}` : '';
  const likers = members.filter((m) => likerIds.includes(m.id));
  const tag = decided ? 'Picked' : `Winner · ${likes} of ${members.length} liked`;

  return (
    <View style={styles.card}>
      <View style={styles.photo}>
        <Scene kind={option.plan_json.scene} banner />
        <View style={styles.tag}>
          <Txt style={styles.tagText} color={colors.white}>
            {tag}
          </Txt>
        </View>
      </View>
      <View style={styles.info}>
        <View style={styles.between}>
          <Txt variant="h15">{option.name}</Txt>
          <Txt variant="h14" color={colors.tealDark}>
            {formatMoney(option.cost_per_person)}
          </Txt>
        </View>
        <Txt variant="s11" style={{ marginTop: 2, marginBottom: 8 }}>
          {days} day{days === 1 ? '' : 's'} · per person{when}
        </Txt>
        {likers.length ? (
          <Avatars people={memberAvatars(members).filter((a) => likerIds.includes(a.key))} />
        ) : (
          <Txt variant="s11">No likes yet</Txt>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.teal,
    overflow: 'hidden',
    ...shadow,
  },
  photo: { height: 84 },
  tag: {
    position: 'absolute',
    left: 10,
    top: 10,
    backgroundColor: colors.teal,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tagText: { fontFamily: fontFamily.bold, fontSize: 10, lineHeight: 13 },
  info: { paddingVertical: 12, paddingHorizontal: 14 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
