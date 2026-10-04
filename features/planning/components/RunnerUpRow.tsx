import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatars } from '@/components/ui/Avatars';
import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { memberAvatars } from '@/features/trip/members';
import type { Member } from '@/features/trip/types';
import { colors, formatMoney } from '@/lib/theme';
import { freeLabelShort } from '../dateFinder';
import { formatRange } from '../dates';
import { likesLabel, type OptionResult } from '../tally';

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
  /** Outlined in teal when it's my choice. */
  chosen: boolean;
  /** Who chose it and the "Choose this trip" button. */
  footer?: ReactNode;
}

/** Another trip, with its likes. Can be chosen just like the most-liked one. */
export function RunnerUpRow({ result, members, solo, chosen, footer }: RunnerUpRowProps) {
  const line = runnerUpLine(result, solo);
  const likers = memberAvatars(members).filter((a) => result.likerIds.includes(a.key));
  return (
    <Card style={[styles.card, chosen && styles.chosen]} accessibilityLabel={`${result.option.name}, ${likesLabel(result.likes)}`}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Txt variant="h14">{result.option.name}</Txt>
          <Txt variant="s11" color={line.color} style={{ marginTop: 2 }}>
            {line.text}
          </Txt>
        </View>
        <View style={styles.right}>
          <Txt variant="h14" color={result.likes ? colors.text : colors.textMuted}>
            {likesLabel(result.likes)}
          </Txt>
          {likers.length > 1 ? <Avatars people={likers} size={20} /> : null}
        </View>
      </View>
      {footer}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderColor: colors.card },
  chosen: { borderColor: colors.teal },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  right: { alignItems: 'flex-end', gap: 2 },
});
