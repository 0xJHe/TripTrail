import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';
import { useTryDemoTrip } from '../hooks/useTryDemoTrip';

/** Settings: "Try a demo trip" opens this person's own copy of the ready-made Penang trip. */
export function TryDemoCard() {
  const { start, busy, error } = useTryDemoTrip();
  return (
    <Card style={styles.card}>
      <View>
        <Txt variant="h15">Try a demo trip</Txt>
        <Txt variant="s11" style={{ marginTop: 2 }}>
          A ready-made trip you can explore with Demo mode
        </Txt>
      </View>
      <Button
        label="Try a demo trip"
        onPress={start}
        loading={busy}
        icon={<Ionicons name="map-outline" size={18} color={colors.white} />}
        testID="try-demo-trip"
      />
      {error ? (
        <View style={styles.row} accessibilityRole="alert">
          <Ionicons name="warning" size={18} color={colors.red} />
          <Txt variant="b12" weight="semibold" color={colors.red} style={{ flex: 1 }} testID="try-demo-error">
            {error}
          </Txt>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
