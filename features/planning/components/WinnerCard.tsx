import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatars } from '@/components/ui/Avatars';
import { Txt } from '@/components/ui/Txt';
import { memberAvatars } from '@/features/trip/members';
import type { Member } from '@/features/trip/types';
import { colors, fontFamily, formatMoney, radius, shadow } from '@/lib/theme';
import { freeLabelShort } from '../dateFinder';
import { formatRange } from '../dates';
import { likesLabel, type OptionResult } from '../tally';
import { OptionPicture } from './OptionPicture';

interface WinnerCardProps {
  result: OptionResult;
  members: Member[];
  /** "Most liked · 4 of 4", "Tied · 1 like each" or "Planned". */
  tag: string;
  /** Outlined in teal when it's my choice. */
  chosen: boolean;
  /** Who chose it and the "Choose this trip" button. */
  footer?: ReactNode;
}

/** The most-liked trip (prototype screen 4). */
export function WinnerCard({ result, members, tag, chosen, footer }: WinnerCardProps) {
  const { option, likerIds, fit } = result;
  const days = option.plan_json.days;
  const when = fit.window ? ` · ${formatRange(fit.window.start, fit.window.end)} · ${freeLabelShort(fit.window)}` : '';
  const likers = memberAvatars(members).filter((a) => likerIds.includes(a.key));

  return (
    <View style={[styles.card, chosen && styles.chosen]} accessibilityLabel={`${option.name}, ${tag}`}>
      <View style={styles.photo}>
        <OptionPicture tripId={option.trip_id} plan={option.plan_json} banner />
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
        <Txt variant="s11" style={{ marginTop: 2 }}>
          {days} day{days === 1 ? '' : 's'} · per person{when}
        </Txt>
        {!fit.window ? (
          <Txt variant="s11" weight="semibold" color={colors.amberText} style={{ marginTop: 2 }}>
            ⚠ No {days} days in a row work yet
          </Txt>
        ) : null}
        <View style={[styles.likes, { marginTop: 6 }]}>
          <Txt variant="s11">{likesLabel(result.likes)}</Txt>
          {likers.length ? <Avatars people={likers} size={20} /> : null}
        </View>
        {footer}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.card,
    overflow: 'hidden',
    ...shadow,
  },
  chosen: { borderColor: colors.teal },
  photo: { height: 110 },
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
  likes: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
