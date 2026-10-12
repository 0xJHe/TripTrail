import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { BOTTOM_BAR_SPACE, BottomBar } from '@/components/ui/BottomBar';
import { Button } from '@/components/ui/Button';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { NoPlan } from '@/features/today/components/NoPlan';
import { longDate } from '@/features/today/todayPlan';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { colors } from '@/lib/theme';
import { ClosedCount } from '../components/ClosedCount';
import { HowTodayWent } from '../components/HowTodayWent';
import { TomorrowList } from '../components/TomorrowList';
import { useDoneToday } from '../hooks/useDoneToday';

/**
 * Done for today (prototype screen 14): how today went (planned vs actual), tomorrow's stops
 * to edit, who has closed their day, and Done for today, which switches this phone's location
 * sharing off until 1 hour before tomorrow's first stop. It is final (the day becomes read-only
 * for this person), so it asks first: "Finish today?" with Finish / Cancel.
 */
export function DoneTodayScreen() {
  const d = useDoneToday();
  const place = d.trip?.destination ?? d.trip?.name ?? '';
  const subtitle = d.date ? [`Day ${d.day}`, longDate(d.date), place].filter(Boolean).join(' · ') : undefined;
  const header = <NavyHeader title="Done for today?" subtitle={subtitle} onBack={() => router.back()} />;

  if (d.loading || !d.trip) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.teal} />
        </View>
      </View>
    );
  }
  if (!d.isTripDay) {
    return (
      <View style={styles.screen}>
        {header}
        <NoPlan icon="calendar-outline" title="Not a trip day" text="Done for today is for the days of the trip." />
      </View>
    );
  }

  const confirmDone = () =>
    Alert.alert('Finish today?', "You won't be able to change today's plan after this.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finish', onPress: d.done },
    ]);

  const note = d.tomorrow
    ? `Tapping Done switches your location off for the night. It turns back on 1 hour before tomorrow's first stop${d.backAt ? ` (${d.backAt})` : ''}.`
    : "Tapping Done switches your location off. That's the last day of the trip.";

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        <HowTodayWent review={d.review} />
        {d.tomorrow && d.tomorrowDate ? (
          <TomorrowList day={d.day + 1} date={d.tomorrowDate} stops={d.tomorrow} onEdit={d.editStop} onAdd={d.addStop} />
        ) : null}
        <ClosedCount members={d.members} closed={d.closed} />
        <View style={styles.note}>
          <Ionicons name="location-outline" size={18} color={colors.tealDark} style={{ marginTop: 1 }} />
          <Txt variant="b12" style={{ flex: 1 }}>
            {note}
          </Txt>
        </View>
        {d.error ? <ErrorLine message={d.error} /> : null}
      </ScrollView>
      <BottomBar>
        <Button label="Done for today" onPress={confirmDone} loading={d.saving} testID="done-for-today" />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: BOTTOM_BAR_SPACE, gap: 10 },
  note: { flexDirection: 'row', gap: 10, backgroundColor: colors.tealTint, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
});
