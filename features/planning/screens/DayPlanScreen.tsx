import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip, Chips } from '@/components/ui/Chip';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { BudgetBar } from '@/features/money/components/BudgetBar';
import { ExtraSpends } from '@/features/money/components/ExtraSpends';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { memberCountLabel } from '@/features/trip/members';
import { tripEntryRoute } from '@/features/trip/routes';
import { useCurrentTrip } from '@/features/trip/store';
import { colors } from '@/lib/theme';
import { AddStopRow } from '../components/AddStopRow';
import { NoteLine } from '../components/NoteLine';
import { StopRow } from '../components/StopRow';
import { formatRange } from '../dates';
import { useDayPlan } from '../hooks/useDayPlan';
import { dayDate } from '../stops';

/** Day plan (prototype screen 5): day tabs, budget bar, timeline of stops. */
export function DayPlanScreen() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const plan = useDayPlan(tripId);
  // Set after building, e.g. when Google's daily limit was reached.
  const { note } = useLocalSearchParams<{ note?: string }>();
  const [picked, setPicked] = useState(1);
  const { trip, days, start } = plan;
  const day = Math.min(picked, days);
  const dayStops = plan.stops.filter((s) => s.day_number === day);

  if (!tripId || (!plan.loading && !trip)) {
    return <Empty title="No trip open" text="Open a trip from your trips list to see its plan." />;
  }
  if (plan.loading || !trip) {
    return (
      <View style={[styles.screen, styles.center]}>
        {plan.error ? <ErrorLine message="Couldn't load the plan." /> : <ActivityIndicator color={colors.teal} />}
      </View>
    );
  }
  if (trip.stage !== 'decided') {
    return (
      <Empty
        title={trip.name}
        text="The plan shows here once the group has chosen a trip and built it."
        action={{ label: 'Go to the trip choice', onPress: () => router.push(tripEntryRoute(trip)) }}
      />
    );
  }

  const when = formatRange(start, dayDate(start, days));
  const openStop = (stopId: string) => router.push({ pathname: '/trip/[id]/stop/[stopId]', params: { id: trip.id, stopId, day: String(day) } });

  return (
    <View style={styles.screen}>
      <NavyHeader
        title={trip.destination ?? trip.name}
        subtitle={`${when} · ${memberCountLabel(plan.members.length)}`}
        onBack={() => router.replace('/home')}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={false} onRefresh={plan.refetch} tintColor={colors.teal} />}>
        <Chips>
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
            <Chip key={d} label={`Day ${d}`} selected={d === day} onPress={() => setPicked(d)} />
          ))}
        </Chips>
        {note ? <NoteLine text={note} /> : null}
        <BudgetBar summary={plan.budget}>
          <ExtraSpends tripId={trip.id} day={day} />
        </BudgetBar>
        <View>
          {dayStops.length === 0 ? (
            <Txt variant="s11" style={styles.note}>
              Nothing planned for Day {day} yet.
            </Txt>
          ) : null}
          {dayStops.map((s) => (
            <StopRow key={s.id} stop={s} onPress={() => openStop(s.id)} />
          ))}
          <AddStopRow onPress={() => openStop('new')} />
        </View>
        {plan.error ? <ErrorLine message="Couldn't refresh the plan. Pull down to try again." /> : null}
      </ScrollView>
    </View>
  );
}

function Empty({ title, text, action }: { title: string; text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.screen}>
      <NavyHeader title={title} onBack={() => router.replace('/home')} />
      <View style={[styles.center, { gap: 16 }]}>
        <Txt variant="b13" style={{ textAlign: 'center' }}>
          {text}
        </Txt>
        <Button label={action?.label ?? 'See your trips'} onPress={action?.onPress ?? (() => router.replace('/home'))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32, gap: 8 },
  note: { marginLeft: 26, marginBottom: 8 },
});
