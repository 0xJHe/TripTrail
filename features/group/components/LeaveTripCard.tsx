import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { button, colors, fontFamily, radius } from '@/lib/theme';
import { leaveText } from '../groupList';

interface LeaveTripCardProps {
  /** Only I am left: leaving deletes the trip. */
  lastMember: boolean;
  leaving: boolean;
  error: string | null;
  onLeave: () => void;
}

/** "Leave trip" at the bottom of the Group tab, with a "Leave this trip?" confirm step. */
export function LeaveTripCard({ lastMember, leaving, error, onLeave }: LeaveTripCardProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Pressable
        onPress={() => setConfirming(true)}
        accessibilityRole="button"
        accessibilityLabel="Leave trip"
        testID="leave-trip"
        style={({ pressed }) => [styles.leave, pressed && { opacity: 0.7 }]}>
        <Ionicons name="exit-outline" size={18} color={colors.red} />
        <Txt style={styles.leaveText} color={colors.red}>
          Leave trip
        </Txt>
      </Pressable>
    );
  }

  return (
    <Card style={styles.confirm} testID="leave-confirm">
      <View style={styles.head}>
        <Ionicons name="warning-outline" size={18} color={colors.red} />
        <Txt variant="h15">Leave this trip?</Txt>
      </View>
      <Txt variant="b12" color={lastMember ? colors.red : colors.textMuted}>
        {leaveText(lastMember)}
      </Txt>
      {error ? <ErrorLine message={error} /> : null}
      <View style={styles.row}>
        <Pressable
          onPress={leaving ? undefined : () => setConfirming(false)}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          testID="leave-cancel"
          style={({ pressed }) => [styles.btn, styles.cancel, pressed && { opacity: 0.7 }]}>
          <Txt style={styles.leaveText}>Cancel</Txt>
        </Pressable>
        <Pressable
          onPress={leaving ? undefined : onLeave}
          accessibilityRole="button"
          accessibilityLabel={lastMember ? 'Leave and delete trip' : 'Leave'}
          accessibilityState={{ busy: leaving }}
          testID="leave-yes"
          style={({ pressed }) => [styles.btn, styles.yes, pressed && { opacity: 0.85 }]}>
          {leaving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Txt style={styles.leaveText} color={colors.white}>
              {lastMember ? 'Leave and delete' : 'Leave'}
            </Txt>
          )}
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  leave: {
    minHeight: button.minHeight,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.red,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  leaveText: { fontFamily: fontFamily.semibold, fontSize: 14, lineHeight: 18 },
  confirm: { gap: 8, borderWidth: 1, borderColor: colors.red },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, minHeight: button.minHeight, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  cancel: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  yes: { backgroundColor: colors.red },
});
