import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';
import { BOOKED_IN_THE_WAY, NO_TIME_LEFT, overlapText, type OverlapCheck } from '../overlap';
import { clockOf } from '../stops';

interface OverlapWarningProps {
  overlap: Extract<OverlapCheck, { ok: false }>;
  onShift: () => void;
  saving: boolean;
}

/**
 * Under the times on Add a stop / Edit stop when they overlap another stop: "This overlaps with
 * [stop] (10:00–11:30)." and Shift later stops, or why it can't shift (past midnight, a booked
 * stop in the way). Changing a time hides it.
 */
export function OverlapWarning({ overlap, onShift, saving }: OverlapWarningProps) {
  const why = overlap.reason === 'midnight' ? NO_TIME_LEFT : overlap.reason === 'booked' ? BOOKED_IN_THE_WAY : null;
  return (
    <View style={styles.box} accessibilityRole="alert" testID="overlap-warning">
      <View style={styles.row}>
        <Ionicons name="time-outline" size={16} color={colors.amberText} />
        <Txt variant="b12" weight="semibold" color={colors.amberText} style={{ flex: 1 }}>
          {overlapText(overlap.with, clockOf)}
        </Txt>
      </View>
      {overlap.moves ? (
        <Button label="Shift later stops" size="sm" onPress={onShift} loading={saving} testID="shift-later-stops" />
      ) : why ? (
        <Txt variant="b12">{why}</Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.amber, backgroundColor: '#FFF8EC', padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
