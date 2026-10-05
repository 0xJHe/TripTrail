import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Txt } from '@/components/ui/Txt';

/** "Today's plan · 3 of 6 stops done · on time" with a bar. */
export function DayProgress({ done, total, pace }: { done: number; total: number; pace: string | null }) {
  const label = [`${done} of ${total} stops done`, pace].filter(Boolean).join(' · ');
  return (
    <Card style={{ gap: 8 }}>
      <View style={styles.between}>
        <Txt variant="b12" weight="semibold">
          Today's plan
        </Txt>
        <Txt variant="s11">{label}</Txt>
      </View>
      <ProgressBar value={total > 0 ? done / total : 0} />
    </Card>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
});
