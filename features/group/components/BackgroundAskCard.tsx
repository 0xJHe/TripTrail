import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { useLocationAccess } from '@/features/today/permission';
import { useCurrentTrip } from '@/features/trip/store';
import { backgroundSupported, useLocationSource } from '@/lib/location';
import { colors } from '@/lib/theme';
import { useBackgroundAccess } from '../backgroundAccess';
import { restartBackgroundNotice } from '../backgroundShare';
import { useNotificationAccess } from '../notificationAccess';
import { useTripDay } from '../hooks/useTripDay';

/**
 * Explains, then asks for "Allow all the time" so the group still sees this phone with the
 * screen off. Shown during the sharing window once location is on, once per trip; a no keeps
 * sharing to while the app is open. Never in Expo Go or Demo mode (it can't run there).
 * Once background sharing runs, Android 13+ also needs notifications allowed for its
 * "sharing your location" notice to show: the same card explains and asks once.
 */
export function BackgroundAskCard() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const { sharing } = useTripDay(tripId);
  const demo = useLocationSource() === 'demo';
  const permission = useLocationAccess((s) => s.permission);
  const bg = useBackgroundAccess((s) => s.permission);
  const declined = useBackgroundAccess((s) => (tripId ? s.declinedTrips.includes(tripId) : false));
  const { ask, decline } = useBackgroundAccess.getState();
  const notify = useNotificationAccess((s) => s.permission);
  const notifyAnswered = useNotificationAccess((s) => s.answered);
  const [asking, setAsking] = useState(false);

  const base = !!tripId && backgroundSupported() && !demo && sharing && permission === 'granted';
  const askBackground = base && bg === 'ask' && !declined;
  const askNotify = base && bg === 'granted' && !notifyAnswered && notify === 'ask';

  // Check notifications once background sharing can run (not asked yet on this phone).
  useEffect(() => {
    if (base && bg === 'granted' && !notifyAnswered && notify == null) useNotificationAccess.getState().refresh();
  }, [base, bg, notifyAnswered, notify]);

  if (!tripId || (!askBackground && !askNotify)) return null;

  const run = async (action: () => Promise<void>) => {
    setAsking(true);
    try {
      await action();
    } finally {
      setAsking(false);
    }
  };

  if (askNotify) {
    const allow = () =>
      run(async () => {
        await useNotificationAccess.getState().ask();
        if (useNotificationAccess.getState().permission === 'granted') await restartBackgroundNotice();
      });
    return (
      <Card style={{ gap: 10 }} testID="notification-ask">
        <View style={styles.row}>
          <Ionicons name="notifications-outline" size={20} color={colors.teal} />
          <Txt variant="h14" style={{ flex: 1 }}>
            Show when you're sharing?
          </Txt>
        </View>
        <Txt variant="b12" color={colors.textMuted}>
          Allow notifications on the next screen so your phone shows "TripTrail is sharing your location" while the group
          can see you. That's the only notification TripTrail sends.
        </Txt>
        <View style={styles.row}>
          <Button label="Allow notifications" size="sm" onPress={allow} loading={asking} style={{ flex: 1 }} />
          <Button
            label="Not now"
            size="sm"
            variant="secondary"
            onPress={() => useNotificationAccess.getState().decline()}
            style={{ flex: 1 }}
          />
        </View>
      </Card>
    );
  }

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
        <Button label="Allow all the time" size="sm" onPress={() => run(() => ask(tripId))} loading={asking} style={{ flex: 1 }} />
        <Button label="Not now" size="sm" variant="secondary" onPress={() => decline(tripId)} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
