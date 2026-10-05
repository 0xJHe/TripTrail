import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import type { GroupLocation, LocationPermission } from '@/lib/location';
import { colors, fontFamily } from '@/lib/theme';

/** "Location on · 4 of 4 sharing" (prototype .pill). */
export function LocationPill({ location, groupSize }: { location: GroupLocation | null; groupSize: number }) {
  const sharing = location ? location.members.length : 0;
  const text = !location
    ? 'Finding your location…'
    : sharing > 1
      ? `Location on · ${sharing} of ${Math.max(groupSize, sharing)} sharing`
      : 'Location on';
  return (
    <View style={[styles.pill, !location && { backgroundColor: colors.chip }]}>
      <View style={[styles.dot, { backgroundColor: location ? colors.tealDark : colors.disabled }]} />
      <Txt style={styles.pillText} color={location ? colors.tealDark : colors.textMuted}>
        {text}
      </Txt>
    </View>
  );
}

/** Explains why location is needed before the system prompt; points to Settings if it was turned off for good. */
export function PermissionCard({ permission, onAllow }: { permission: LocationPermission; onAllow: () => void }) {
  const blocked = permission === 'blocked';
  return (
    <Card style={{ gap: 10 }} testID="location-permission">
      <View style={styles.row}>
        <Ionicons name="navigate-circle" size={22} color={colors.teal} />
        <Txt variant="h14" style={{ flex: 1 }}>
          Let TripTrail tick off your stops
        </Txt>
      </View>
      <Txt variant="b13" color={colors.textMuted}>
        {blocked
          ? 'Location is turned off for TripTrail. Turn it on in your phone settings so stops tick themselves off when you arrive.'
          : "With your location on, each stop ticks itself off when you arrive and your group sees the day update live. It's only used while the app is open."}
      </Txt>
      <Button label={blocked ? 'Open settings' : 'Turn on location'} size="sm" onPress={onAllow} />
    </Card>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.tealTint,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontFamily: fontFamily.semibold, fontSize: 11, lineHeight: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
