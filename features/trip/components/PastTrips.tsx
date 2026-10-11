import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';
import { pastTripsLabel } from '../pastTrips';
import type { Trip } from '../types';
import { TripRow } from './TripRow';

interface PastTripsProps {
  trips: Trip[];
  onOpen: (trip: Trip) => void;
}

/** "Past trips (3)" under the current ones: collapsed until tapped; each trip still opens. */
export function PastTrips({ trips, onOpen }: PastTripsProps) {
  const [open, setOpen] = useState(false);
  if (trips.length === 0) return null;
  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${pastTripsLabel(trips.length)}, ${open ? 'tap to hide' : 'tap to show'}`}
        hitSlop={6}
        testID="past-trips-toggle"
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.6 }]}>
        <Txt variant="lbl">{pastTripsLabel(trips.length)}</Txt>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      </Pressable>
      {open ? trips.map((trip) => <TripRow key={trip.id} trip={trip} onPress={() => onOpen(trip)} />) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 },
});
