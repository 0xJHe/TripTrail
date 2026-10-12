import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip, Chips } from '@/components/ui/Chip';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { SettingsButton } from '@/features/demo/components/SettingsButton';
import { BudgetBar } from '@/features/money/components/BudgetBar';
import { ExtraSpends } from '@/features/money/components/ExtraSpends';
import { RecapLink } from '@/features/recap/components/RecapLink';
import { useFinishedDays } from '@/features/recap/hooks/useFinishedDays';
import { useRecapDays } from '@/features/recap/hooks/useRecapDays';
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

/**
 * Day plan (prototype screen 5): day tabs, budget bar, timeline of stops. Opens on today's trip
 * day (the open day). A day finished for this person (Done for today, or the next day has
 * started) is read-only: "Day finished", no Add a stop, no Edit; its Day recap link stays.
 */
export function DayPlanScreen() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const plan = useDayPlan(tripId);
  // Set after building, e.g. when Google's daily limit was reached.
  const { note } = useLocalSearchParams<{ note?: string }>();
  const [picked, setPicked] = useState<number | null>(null);
  const { trip, days, start } = plan;
  const decided = trip?.stage === 'decided' ? tripId : undefined;
  const finished = useFinishedDays(decided, days);
  // Until a day tab is tapped: today's trip day (Day 1 before the trip, the last day after it).
  const day = Math.max(1, Math.min(picked ?? (finished.openDay || 1), days));
  const locked = finished.isFinished(day);
  const dayStops = plan.stops.filter((s) => s.day_number === day);
  // Finished days get a "Day recap" link (story card, screen 15).
  const recapDays = useRecapDays(decided, days);

  if (!tripId || (!plan.loading && !trip)) {
    return <Empty title="No trip open" text="Open a trip from your trips list to see its plan." />;
  }
  if (plan.loading || !trip) {
    return (
      <View style={[styles.screen, styles.center]}>
        {plan.error ? <ErrorLine message="Couldn't load the plan." onRetry={plan.refetch} /> : <ActivityIndicator color={colors.teal} />}
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
        right={<SettingsButton />}
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
        {locked ? <DayFinishedNote /> : null}
        {recapDays.has(day) ? <RecapLink day={day} /> : null}
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
            <StopRow key={s.id} stop={s} needsHalal={plan.needsHalal} onPress={locked ? undefined : () => openStop(s.id)} />
          ))}
          {locked ? null : <AddStopRow onPress={() => openStop('new')} />}
        </View>
        {plan.error ? <ErrorLine message="Couldn't refresh the plan." onRetry={plan.refetch} /> : null}
      </ScrollView>
    </View>
  );
}

/** Small grey line on a finished day: its plan can't be changed any more. */
function DayFinishedNote() {
  return (
    <View style={styles.finished} testID="day-finished">
      <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
      <Txt variant="s11">Day finished</Txt>
    </View>
  );
}

function Empty({ title, text, action }: { title: string; text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.screen}>
      <NavyHeader title={title} onBack={() => router.replace('/home')} right={<SettingsButton />} />
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
  finished: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
