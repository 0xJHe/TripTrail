import { StyleSheet, View } from 'react-native';

import { Chip, Chips } from '@/components/ui/Chip';
import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily, formatMoney, radius } from '@/lib/theme';
import { freeLabel } from '../dateFinder';
import { formatRange } from '../dates';
import type { OptionFit } from '../optionFit';
import type { TripOption } from '../types';
import { OptionPicture } from './OptionPicture';

interface OptionCardProps {
  option: TripOption;
  fit: OptionFit;
  solo: boolean;
  /** Someone in the group needs halal food. */
  needsHalal: boolean;
}

/** "📅 12 – 14 Oct · all 4 of you are free", coloured by how many can make it. */
export function datesLine(fit: OptionFit): { text: string; color: string } {
  const w = fit.window;
  if (!w) return { text: '📅 No dates work yet', color: colors.red };
  const text = `📅 ${formatRange(w.start, w.end)} · ${freeLabel(w)}`;
  return { text, color: w.freeCount >= w.total ? colors.green : colors.amberText };
}

/** "✓ Fits everyone's budget · 3 of 4 must-haves covered" */
function budgetLine(fit: OptionFit, solo: boolean): { text: string; color: string } {
  const { covered, total } = fit.mustHaves;
  const musts = total > 0 ? ` · ${covered} of ${total} must-haves covered` : '';
  if (fit.overBudget === 0) {
    return { text: `✓ Fits ${solo ? 'your' : "everyone's"} budget${musts}`, color: colors.tealDark };
  }
  const over = solo ? 'Over your budget' : `Over ${fit.overBudget} budget${fit.overBudget === 1 ? '' : 's'}`;
  return { text: `⚠ ${over}${musts}`, color: colors.red };
}

/** Trip option card on the swipe deck (prototype screen 3). */
export function OptionCard({ option, fit, solo, needsHalal }: OptionCardProps) {
  const dates = datesLine(fit);
  const budget = budgetLine(fit, solo);
  const plan = option.plan_json;
  const tags = needsHalal && plan.halal ? [...option.tags.slice(0, 3), 'Halal available'] : option.tags.slice(0, 4);

  return (
    <View style={styles.card}>
      <View style={styles.photo}>
        <OptionPicture tripId={option.trip_id} plan={plan} />
        {fit.fitsEveryone ? (
          <View style={styles.tag}>
            <Txt style={styles.tagText}>{solo ? 'Fits you' : 'Fits everyone'}</Txt>
          </View>
        ) : null}
      </View>
      <View style={styles.info}>
        <View style={styles.between}>
          <Txt variant="h22" style={{ fontSize: 20, flex: 1 }} numberOfLines={1}>
            {option.name}
          </Txt>
          <Txt variant="h15" color={colors.tealDark}>
            {formatMoney(option.cost_per_person)}
          </Txt>
        </View>
        <Txt variant="s11" style={{ marginTop: -4 }}>
          {plan.days} day{plan.days === 1 ? '' : 's'} · per person
        </Txt>
        <Txt variant="b12" weight="bold" color={dates.color}>
          {dates.text}
        </Txt>
        <Chips>
          {tags.map((t) => (
            <Chip key={t} label={t} size="sm" ghost />
          ))}
        </Chips>
        <Txt variant="b12" weight="semibold" color={budget.color}>
          {budget.text}
        </Txt>
        <Txt variant="s11" numberOfLines={2}>
          {plan.dayTitles.map((t, i) => `Day ${i + 1} ${t}`).join(' · ')}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  photo: { flex: 1, minHeight: 110 },
  tag: {
    position: 'absolute',
    left: 10,
    top: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tagText: { fontFamily: fontFamily.bold, fontSize: 10, lineHeight: 13, color: colors.text },
  info: { paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
