import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { clockOf } from '@/features/planning/stops';
import { colors, fontFamily } from '@/lib/theme';
import type { NewDay } from '@/supabase/functions/_shared/replan';

/** "Suggested new day": new times with a short note, then the dropped stops struck out. */
export function NewDayList({ plan, ai }: { plan: NewDay; ai: boolean }) {
  return (
    <View style={styles.box} testID="new-day">
      <View style={styles.head}>
        <Txt variant="lbl">Suggested new day</Txt>
        {ai ? (
          <Txt variant="lbl" color={colors.tealDark}>
            ✨ AI
          </Txt>
        ) : null}
      </View>
      {plan.items.map((item) =>
        item.dropped ? (
          <View key={item.stopId} style={styles.row} accessibilityLabel={`Drop ${item.name}, ${item.note ?? ''}`}>
            <Txt style={styles.time} color={colors.red}>
              Drop
            </Txt>
            <Txt variant="b12" color={colors.red} style={styles.name}>
              <Txt variant="b12" color={colors.red} style={styles.struck}>
                {item.name}
              </Txt>
              {item.note ? <Txt variant="s11" color={colors.red}>{` · ${item.note}`}</Txt> : null}
            </Txt>
          </View>
        ) : (
          <View key={item.stopId} style={styles.row}>
            <Txt style={styles.time} color={colors.tealDark}>
              {clockOf(item.start)}
            </Txt>
            <Txt variant="b12" style={styles.name}>
              {item.name}
              {item.note ? <Txt variant="s11">{` · ${item.note}`}</Txt> : null}
            </Txt>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.background, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 5 },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  time: { width: 40, fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 17 },
  name: { flex: 1 },
  struck: { textDecorationLine: 'line-through' },
});
