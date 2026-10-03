import { Pressable, StyleSheet, View } from 'react-native';

import { Avatars } from '@/components/ui/Avatars';
import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { memberAvatars } from '@/features/trip/members';
import type { Member } from '@/features/trip/types';
import { colors, formatMoney } from '@/lib/theme';
import { freeLabelShort } from '../dateFinder';
import { formatRange } from '../dates';
import { likesLabel, type OptionResult } from '../tally';
import { YourPick } from './WinnerCard';

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five'];
const word = (n: number) => WORDS[n] ?? String(n);

/** One line about the option: over budget (red), not everyone free (amber), or just price and length. */
export function runnerUpLine(result: OptionResult, solo: boolean): { text: string; color: string } {
  const { option, fit } = result;
  const price = formatMoney(option.cost_per_person);
  if (fit.overBudget > 0) {
    const over = solo ? 'over your budget' : `over ${word(fit.overBudget)} budget${fit.overBudget === 1 ? '' : 's'}`;
    return { text: `${price} · ${over}`, color: colors.red };
  }
  const w = fit.window;
  if (!w) return { text: `${price} · no dates work yet`, color: colors.amberText };
  if (w.freeCount < w.total) {
    return { text: `${price} · ${formatRange(w.start, w.end)} · ${freeLabelShort(w)}`, color: colors.amberText };
  }
  const days = option.plan_json.days;
  return { text: `${price} · ${days} day${days === 1 ? '' : 's'}`, color: colors.textMuted };
}

interface RunnerUpRowProps {
  result: OptionResult;
  members: Member[];
  solo: boolean;
  selected: boolean;
  onPress: () => void;
}

/** A runner-up trip. Tap it to pick it instead of the top one. */
export function RunnerUpRow({ result, members, solo, selected, onPress }: RunnerUpRowProps) {
  const line = runnerUpLine(result, solo);
  const likers = memberAvatars(members).filter((a) => result.likerIds.includes(a.key));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${result.option.name}, ${likesLabel(result.likes)}`}
      style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      <Card style={[styles.row, selected && styles.selected]}>
        <View style={{ flex: 1 }}>
          <Txt variant="h14">{result.option.name}</Txt>
          <Txt variant="s11" color={line.color} style={{ marginTop: 2 }}>
            {line.text}
          </Txt>
          {selected ? (
            <View style={{ marginTop: 6 }}>
              <YourPick />
            </View>
          ) : null}
        </View>
        <View style={styles.right}>
          <Txt variant="h14" color={result.likes ? colors.text : colors.textMuted}>
            {likesLabel(result.likes)}
          </Txt>
          {likers.length > 1 ? <Avatars people={likers} /> : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderColor: colors.card },
  selected: { borderColor: colors.teal },
  right: { alignItems: 'flex-end', gap: 2 },
});
