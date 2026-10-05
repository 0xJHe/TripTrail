import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { useCurrentTrip } from '@/features/trip/store';
import { useDemo } from '@/lib/demo';
import { colors } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const MOMENTS: { icon: IconName; color: string; text: string }[] = [
  { icon: 'alert-circle', color: colors.red, text: 'Arriving late at one stop' },
  { icon: 'checkmark-circle', color: colors.green, text: 'Leaving one stop early' },
  { icon: 'rainy', color: colors.blue, text: 'Rain near an outdoor stop' },
  { icon: 'battery-dead', color: colors.amber, text: 'One member 900 m away with low battery' },
];

/** Settings: the Demo mode switch. */
export function SettingsScreen() {
  const enabled = useDemo((s) => s.enabled);
  const setEnabled = useDemo((s) => s.setEnabled);
  const hasTrip = useCurrentTrip((s) => s.currentTripId != null);

  return (
    <View style={styles.screen}>
      <NavyHeader title="Settings" onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
      <ScrollView contentContainerStyle={styles.body}>
        <Card style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Txt variant="h15">Demo mode</Txt>
              <Txt variant="s11" style={{ marginTop: 2 }}>
                Try the live-trip features from one room
              </Txt>
            </View>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ true: colors.teal, false: colors.disabled }}
              thumbColor={colors.white}
              accessibilityLabel="Demo mode"
              testID="demo-switch"
            />
          </View>
          <Txt variant="b12">
            Uses a fake clock and replays a fake walk through the open trip&apos;s Day plan, instead of the real time
            and GPS. A bar at the top shows the fake time, with +15 min, Next event and Reset.
          </Txt>
        </Card>

        <Card style={styles.card}>
          <Txt variant="lbl">THE REPLAYED DAY INCLUDES</Txt>
          {MOMENTS.map((m) => (
            <View key={m.text} style={styles.row}>
              <Ionicons name={m.icon} size={18} color={m.color} />
              <Txt variant="b13">{m.text}</Txt>
            </View>
          ))}
          {!hasTrip ? (
            <Txt variant="s11">Open a trip with a Day plan first. The route is built from its stops.</Txt>
          ) : null}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: 16, gap: 12 },
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
