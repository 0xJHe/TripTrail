import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { colors, formatMoney } from '@/lib/theme';
import type { BudgetSummary } from '../budget';

/**
 * "RM 215 spent · RM 380 planned · budget RM 450" (prototype screen 5).
 * Dark fill = spent, light fill = planned; red line when the plan is over budget.
 * `children` go at the bottom of the card (the Plan tab's "+ Add spend" and extra spends).
 */
export function BudgetBar({ summary, children }: { summary: BudgetSummary; children?: ReactNode }) {
  const { spent, planned, budget, spentFill, plannedFill, over } = summary;
  const right = budget != null ? `${formatMoney(planned)} planned · budget ${formatMoney(budget)}` : `${formatMoney(planned)} planned · no budget set`;
  return (
    <Card style={styles.card}>
      <View style={styles.between}>
        <Txt variant="b12" weight="semibold">
          {formatMoney(spent)} spent
        </Txt>
        <Txt variant="s11" style={{ flexShrink: 1, textAlign: 'right' }}>
          {right}
        </Txt>
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={`${formatMoney(spent)} spent, ${right}`}>
        <View style={[styles.fill, styles.planned, { width: `${plannedFill * 100}%` }]} />
        {spentFill > 0 ? (
          <LinearGradient
            colors={[colors.teal, '#3BC9B4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.fill, { width: `${spentFill * 100}%` }]}
          />
        ) : null}
      </View>
      {over > 0 ? (
        <View style={styles.over}>
          <Ionicons name="alert-circle" size={14} color={colors.red} />
          <Txt variant="s11" weight="semibold" color={colors.red}>
            Plan is {formatMoney(over)} over budget
          </Txt>
        </View>
      ) : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 7 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#E3E7ED', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  planned: { backgroundColor: '#B7E6DE' },
  over: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
