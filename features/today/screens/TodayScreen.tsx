import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { SettingsButton } from '@/features/demo/components/SettingsButton';
import { BackgroundAskCard } from '@/features/group/components/BackgroundAskCard';
import { FarBanner } from '@/features/group/components/FarBanner';
import { SplitBanner } from '@/features/group/components/SplitBanner';
import { SpendCheckCard } from '@/features/money/components/SpendCheckCard';
import { DayClosed } from '@/features/recap/components/DayClosed';
import { DAY_END_BAR_SPACE, DayEndBar } from '@/features/recap/components/DayEndBar';
import { DayEndCard } from '@/features/recap/components/DayEndCard';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { tripEntryRoute } from '@/features/trip/routes';
import { colors } from '@/lib/theme';
import { DayProgress } from '../components/DayProgress';
import { EarlyCard } from '../components/EarlyCard';
import { LateCard } from '../components/LateCard';
import { LocationPill, PermissionCard } from '../components/LocationStatus';
import { NoPlan } from '../components/NoPlan';
import { NoPlanFor } from '../components/NoPlanFor';
import { NowCard } from '../components/NowCard';
import { RainCard } from '../components/RainCard';
import { DoneRow, NextCard } from '../components/StopLines';
import { TipCard } from '../components/TipCard';
import { useDirections } from '../directions';
import { useToday } from '../hooks/useToday';
import { longDate } from '../todayPlan';
import { useTipsSetting } from '../tipsSetting';

/**
 * Today card (prototype screen 6): Now, Next, Done, first-timer tip and the day's progress.
 * Running late (screen 7): the late card under Now, with the late stop as its Next.
 * Running early (screen 8): the stop just left in the navy block, the early card, then Next.
 * Spend check (screen 9): under the navy block (or under the late / early card), until answered.
 * Rain backup (screen 10): for the outdoor stop the group is at or heading to.
 * Split & rejoin: "Split · rejoin at [place] at [time]" with a countdown, under the location line.
 * Cards stack in this order: late, rain, early, spend.
 * Done for today (screen 14): once the last stop is finished, "That's every stop for today"
 * (Done for today / Keep going); after Keep going, both pinned to the bottom; after Done, "Day closed".
 */
export function TodayScreen() {
  const openDirections = useDirections();
  const today = useToday();
  const [hiddenTip, setHiddenTip] = useState<string | null>(null);
  const tipsOn = useTipsSetting((s) => s.enabled);
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
          {today.error ? <ErrorLine message="Couldn't load today's plan." onRetry={today.refetch} /> : <ActivityIndicator color={colors.teal} />}
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

  const { now, done } = view;
  const { heading, leftStop, upNext, spend, dayEnd } = today;
  const title = `Today · Day ${view.day}`;
  const subtitle = [longDate(view.date), place].filter(Boolean).join(' · ');
  if (dayEnd.mode === 'closed') {
    return (
      <Frame title={title} subtitle={subtitle}>
        <DayClosed end={dayEnd} day={view.day} />
      </Frame>
    );
  }
  const asking = dayEnd.mode === 'ask';
  const keptGoing = dayEnd.mode === 'keep-going';
  // The stop the spend check asks about moves to Done once answered.
  const doneList = spend.stop ? done.filter((s) => s.id !== spend.stop!.id) : done;
  // First-timer tips can be turned off in Settings.
  const tip = tipsOn && now?.tip && hiddenTip !== now.id ? now.tip : null;
  // The card is for view.next: the Next stop when at (or just left) a stop, the navy block's stop when on the way.
  const lateFor = today.late.alert ? view.next : null;
  // Running early is only ever for a stop without a late card (late wins), so never both.
  const earlyFor = !lateFor && today.early.alert ? view.next : null;

  return (
    <Frame title={title} subtitle={subtitle}>
      <ScrollView
        contentContainerStyle={[styles.body, keptGoing && { paddingBottom: DAY_END_BAR_SPACE }]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={today.refetch} tintColor={colors.teal} />}>
        {today.needsPermission ? (
          <PermissionCard permission={today.needsPermission} onAllow={today.allowLocation} />
        ) : (
          <LocationPill location={today.location} groupSize={today.members.length} />
        )}
        <BackgroundAskCard />
        <SplitBanner />
        <FarBanner />

        {now ? (
          <NowCard
            kind="at"
            stop={now}
            weather={today.weather.now}
            onDone={() => today.doneHere(now)}
            onPin={() => router.push('/pin')}
            leaving={today.leaving}
          />
        ) : leftStop ? (
          <NowCard kind="left" stop={leftStop} weather={today.weather.now} onPin={() => router.push('/pin')} />
        ) : heading ? (
          <NowCard
            kind="heading"
            stop={heading}
            weather={today.weather.now}
            onPin={() => router.push('/pin')}
            onDirections={() => openDirections(heading)}
          />
        ) : asking ? (
          <DayEndCard end={dayEnd} />
        ) : (
          <NowCard kind="finished" visited={done.length} />
        )}

        {lateFor ? (
          <LateCard late={today.late} stop={lateFor} time={today.time} next={now || leftStop ? { weather: today.weather.next } : null} />
        ) : null}
        <RainCard rain={today.rain} />
        {earlyFor ? <EarlyCard early={today.early} stop={earlyFor} left={leftStop} /> : null}
        {spend.stop ? <SpendCheckCard check={spend} named={spend.stop.id !== (now ?? leftStop)?.id} /> : null}
        {asking && (now || leftStop || heading) ? <DayEndCard end={dayEnd} /> : null}

        {upNext && !(lateFor && (now || leftStop)) ? (
          <>
            <Txt variant="lbl">Next</Txt>
            <NextCard stop={upNext} weather={today.weather.next} />
          </>
        ) : null}

        {doneList.length > 0 ? (
          <>
            <Txt variant="lbl">Done</Txt>
            {doneList.map((s) => (
              <DoneRow key={s.id} stop={s} cost={spend.costOf(s)} soFar={spend.soFarOf(s)} />
            ))}
          </>
        ) : null}

        {tip && now ? <TipCard tip={tip} onClose={() => setHiddenTip(now.id)} /> : null}

        <DayProgress done={done.length} total={view.total} pace={view.pace} />
        {today.error ? <ErrorLine message="Couldn't refresh." onRetry={today.refetch} /> : null}
      </ScrollView>
      {keptGoing ? <DayEndBar end={dayEnd} /> : null}
    </Frame>
  );
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
