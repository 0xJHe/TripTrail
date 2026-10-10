import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';
import type { DayEndState } from '../hooks/useDayEnd';

/** "That's every stop for today" with Done for today / Keep going (Today tab, after the last stop). */
export function DayEndCard({ end }: { end: DayEndState }) {
  const stops = end.total === 1 ? '1 stop' : `${end.total} stops`;
  return (
    <Card style={styles.card} testID="day-end-card">
      <View style={styles.head}>
        <Ionicons name="checkmark-done-circle" size={26} color={colors.green} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="h15">That's every stop for today</Txt>
          <Txt variant="s11">
            {end.visited} of {stops} visited. Your location is shared until you tap Done for today.
          </Txt>
        </View>
      </View>
      <View style={styles.buttons}>
        <Button label="Done for today" size="sm" onPress={end.openDone} style={{ flex: 1 }} testID="day-end-done" />
        <Button label="Keep going" size="sm" variant="secondary" onPress={end.keepGoing} style={{ flex: 1 }} testID="day-end-keep" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  buttons: { flexDirection: 'row', gap: 8 },
});
