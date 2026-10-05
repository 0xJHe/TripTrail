import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { SettingsButton } from '@/features/demo/components/SettingsButton';
import { formatRange } from '@/features/planning/dates';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { tripEntryRoute } from '@/features/trip/routes';
import { colors } from '@/lib/theme';
import { DayProgress } from '../components/DayProgress';
import { LocationPill, PermissionCard } from '../components/LocationStatus';
import { NoPlan } from '../components/NoPlan';
import { NowCard } from '../components/NowCard';
import { DoneRow, NextCard } from '../components/StopLines';
import { TipCard } from '../components/TipCard';
import { useToday } from '../hooks/useToday';
import { longDate } from '../todayPlan';
import type { TodayView } from '../types';

/** Today card (prototype screen 6): Now, Next, Done, first-timer tip and the day's progress. */
export function TodayScreen() {
  const today = useToday();
  const [hiddenTip, setHiddenTip] = useState<string | null>(null);
  const { trip, view } = today;
  const place = trip?.destination ?? trip?.name ?? '';

  if (!today.tripId || (!today.loading && !trip)) {
    return (
      <Frame title="Today">
        <NoPlan
          icon="map-outline"
          title="No trip open"
          text="Open a trip from your trips list to see today's stops."
          action={{ label: 'See your trips', onPress: () => router.replace('/home') }}
        />
      </Frame>
    );
  }
  if (!trip || !view) {
    return (
      <Frame title="Today">
        <View style={styles.center}>
          {today.error ? <ErrorLine message="Couldn't load today's plan." /> : <ActivityIndicator color={colors.teal} />}
        </View>
      </Frame>
    );
  }
  if (view.kind === 'no-plan') {
    return (
      <Frame title="Today" subtitle={trip.name}>
        <NoPlanFor view={view} onPlan={() => router.push(tripEntryRoute(trip))} />
      </Frame>
    );
  }

  const { now, next, after, done } = view;
  // Between stops the navy block shows where they're heading, so Next is the one after it.
  const heading = !now ? next : null;
  const upNext = now ? next : after;
  const tip = now?.tip && hiddenTip !== now.id ? now.tip : null;

  return (
    <Frame title={`Today · Day ${view.day}`} subtitle={[longDate(view.date), place].filter(Boolean).join(' · ')}>
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={false} onRefresh={today.refetch} tintColor={colors.teal} />}>
        {today.needsPermission ? (
          <PermissionCard permission={today.needsPermission} onAllow={today.allowLocation} />
        ) : (
          <LocationPill location={today.location} groupSize={today.members.length} />
        )}

        {now ? (
          <NowCard kind="at" stop={now} onDone={() => today.doneHere(now)} leaving={today.leaving} />
        ) : heading ? (
          <NowCard kind="heading" stop={heading} />
        ) : (
          <NowCard kind="finished" visited={done.length} />
        )}

        {upNext ? (
          <>
            <Txt variant="lbl">Next</Txt>
            <NextCard stop={upNext} />
          </>
        ) : null}

        {done.length > 0 ? (
          <>
            <Txt variant="lbl">Done</Txt>
            {done.map((s) => (
              <DoneRow key={s.id} stop={s} />
            ))}
          </>
        ) : null}

        {tip && now ? <TipCard tip={tip} onClose={() => setHiddenTip(now.id)} /> : null}

        <DayProgress done={done.length} total={view.total} pace={view.pace} />
        {today.error ? <ErrorLine message="Couldn't refresh. Pull down to try again." /> : null}
      </ScrollView>
    </Frame>
  );
}

function NoPlanFor({ view, onPlan }: { view: Extract<TodayView, { kind: 'no-plan' }>; onPlan: () => void }) {
  switch (view.reason) {
    case 'not-built':
      return (
        <NoPlan
          icon="people-outline"
          title="No plan yet"
          text="Today's stops show here once the group has picked a trip and built the day plan."
          action={{ label: 'Go to the trip choice', onPress: onPlan }}
        />
      );
    case 'before':
      return (
        <NoPlan
          icon="airplane-outline"
          title={view.daysToGo === 1 ? 'Your trip starts tomorrow' : `Your trip starts in ${view.daysToGo} days`}
          text={`Day 1 is ${longDate(view.startsOn)}. Your stops will show here on the day, and tick themselves off as you go.`}
        />
      );
    case 'after':
      return (
        <NoPlan
          icon="heart-outline"
          title="That's a wrap"
          text={`This trip ran ${formatRange(view.startsOn, view.endsOn)}. Hope it was a great one!`}
        />
      );
    case 'empty':
      return (
        <NoPlan
          icon="cafe-outline"
          title={`Nothing planned for Day ${view.day}`}
          text="A free day! Add stops on the Plan tab if you'd like the app to follow along."
          action={{ label: 'Open the plan', onPress: () => router.push('/plan') }}
        />
      );
  }
}

function Frame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.screen}>
      <NavyHeader title={title} subtitle={subtitle} right={<SettingsButton />} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32, gap: 10 },
});
