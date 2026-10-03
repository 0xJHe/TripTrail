import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatars } from '@/components/ui/Avatars';
import { Txt } from '@/components/ui/Txt';
import { memberAvatars } from '@/features/trip/members';
import type { Member } from '@/features/trip/types';
import { colors, fontFamily, formatMoney, radius, shadow } from '@/lib/theme';
import { freeLabelShort } from '../dateFinder';
import { formatRange } from '../dates';
import type { OptionResult } from '../tally';
import { Scene } from './Scene';

interface WinnerCardProps {
  result: OptionResult;
  members: Member[];
  /** "Winner · 4 of 4 liked", "Tied · 1 like each" or "Picked". */
  tag: string;
  selected: boolean;
  onPress: () => void;
}

/** The top trip (prototype screen 4). Outlined in teal while it's the one being picked. */
export function WinnerCard({ result, members, tag, selected, onPress }: WinnerCardProps) {
  const { option, likerIds, fit } = result;
  const days = option.plan_json.days;
  const when = fit.window ? ` · ${formatRange(fit.window.start, fit.window.end)} · ${freeLabelShort(fit.window)}` : '';
  const likers = memberAvatars(members).filter((a) => likerIds.includes(a.key));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${option.name}, ${tag}`}
      style={[styles.card, selected && styles.selected]}>
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
        <Txt variant="s11" style={{ marginTop: 2 }}>
          {days} day{days === 1 ? '' : 's'} · per person{when}
        </Txt>
        {!fit.window ? (
          <Txt variant="s11" weight="semibold" color={colors.amberText} style={{ marginTop: 2 }}>
            ⚠ No {days} days in a row work yet
          </Txt>
        ) : null}
        <View style={[styles.between, { marginTop: 8 }]}>
          {likers.length ? <Avatars people={likers} /> : <Txt variant="s11">No likes yet</Txt>}
          {selected ? <YourPick /> : null}
        </View>
      </View>
    </Pressable>
  );
}

/** "✓ Your pick" marker for the selected trip. */
export function YourPick() {
  return (
    <View style={styles.pick}>
      <Ionicons name="checkmark-circle" size={16} color={colors.teal} />
      <Txt variant="s11" weight="bold" color={colors.tealDark}>
        Your pick
      </Txt>
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
  selected: { borderColor: colors.teal },
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
  pick: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
