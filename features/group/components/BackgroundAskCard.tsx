import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { useLocationAccess } from '@/features/today/permission';
import { useCurrentTrip } from '@/features/trip/store';
import { backgroundSupported, useLocationSource } from '@/lib/location';
import { colors } from '@/lib/theme';
import { useBackgroundAccess } from '../backgroundAccess';
import { useTripDay } from '../hooks/useTripDay';

/**
 * Explains, then asks for "Allow all the time" so the group still sees this phone with the
 * screen off. Shown during the sharing window once location is on, once per trip; a no keeps
 * sharing to while the app is open. Never in Expo Go or Demo mode (it can't run there).
 */
export function BackgroundAskCard() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const { sharing } = useTripDay(tripId);
  const demo = useLocationSource() === 'demo';
  const permission = useLocationAccess((s) => s.permission);
  const bg = useBackgroundAccess((s) => s.permission);
  const declined = useBackgroundAccess((s) => (tripId ? s.declinedTrips.includes(tripId) : false));
  const { ask, decline } = useBackgroundAccess.getState();
  const [asking, setAsking] = useState(false);

  const show = !!tripId && backgroundSupported() && !demo && sharing && permission === 'granted' && bg === 'ask' && !declined;
  if (!show || !tripId) return null;

  const allow = async () => {
    setAsking(true);
    try {
      await ask(tripId);
    } finally {
      setAsking(false);
    }
  };

  return (
    <Card style={{ gap: 10 }} testID="background-ask">
      <View style={styles.row}>
        <Ionicons name="phone-portrait-outline" size={20} color={colors.teal} />
        <Txt variant="h14" style={{ flex: 1 }}>
          Keep sharing with the screen off?
        </Txt>
      </View>
      <Txt variant="b12" color={colors.textMuted}>
        Choose "Allow all the time" on the next screen so your group still sees you with your phone in your pocket. It only
        runs on trip days, until 1 hour after the last stop, and shows a notification while it's on.
      </Txt>
      <View style={styles.row}>
        <Button label="Allow all the time" size="sm" onPress={allow} loading={asking} style={{ flex: 1 }} />
        <Button label="Not now" size="sm" variant="secondary" onPress={() => decline(tripId)} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
