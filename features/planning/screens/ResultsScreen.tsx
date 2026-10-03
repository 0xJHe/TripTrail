import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { BottomBar, BOTTOM_BAR_SPACE } from '@/components/ui/BottomBar';
import { Button } from '@/components/ui/Button';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { memberCountLabel } from '@/features/trip/members';
import { useCurrentTrip } from '@/features/trip/store';
import { colors } from '@/lib/theme';
import { chooseWinner } from '../api';
import { RunnerUpRow } from '../components/RunnerUpRow';
import { WinnerCard } from '../components/WinnerCard';
import { usePlanningData } from '../hooks/usePlanningData';
import { finishedSwiping, rankOptions } from '../tally';

export function ResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const setCurrentTrip = useCurrentTrip((s) => s.setCurrentTrip);
  const data = usePlanningData(id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { trip, members, options, votes, fits, solo } = data;
  const ranked = options.length && fits.size === options.length ? rankOptions(options, votes, fits) : [];
  const decided = trip?.stage === 'decided';
  // Once picked, the chosen trip stays on top even if votes change later.
  const winner = (decided && ranked.find((r) => r.option.id === trip?.winning_option_id)) || ranked[0];
  const runnersUp = ranked.filter((r) => r !== winner);
  const doneIds = finishedSwiping(options, votes, members.map((m) => m.id));
  const waitingFor = members.filter((m) => !doneIds.includes(m.id));
  const everyoneDone = members.length > 0 && waitingFor.length === 0;

  const title = solo
    ? "You've swiped"
    : everyoneDone
      ? "Everyone's swiped"
      : `${doneIds.length} of ${members.length} have swiped`;

  async function build() {
    if (!winner || !trip) return;
    setSaving(true);
    setError(null);
    try {
      if (!decided) await chooseWinner(trip.id, winner.option, winner.fit.window);
      setCurrentTrip(trip.id);
      await queryClient.invalidateQueries({ queryKey: ['trip', trip.id] });
      router.replace('/plan');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Check your internet and try again.');
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <NavyHeader
        title={title}
        subtitle={`${options.length} trip${options.length === 1 ? '' : 's'} · ${memberCountLabel(members.length)}`}
        onBack={() => router.replace('/home')}
      />
      {data.loading || !winner ? (
        <View style={styles.center}>
          {data.error ? <ErrorLine message="Couldn't load the results." /> : <ActivityIndicator color={colors.teal} />}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <WinnerCard result={winner} members={members} decided={decided} />
          {runnersUp.length ? <Txt variant="lbl">Runners-up</Txt> : null}
          {runnersUp.map((r) => (
            <RunnerUpRow key={r.option.id} result={r} members={members} solo={solo} />
          ))}
          {!everyoneDone && !decided ? (
            <Txt variant="s11" style={styles.note}>
              Still swiping: {waitingFor.map((m) => m.display_name).join(', ')}. Results update live.
            </Txt>
          ) : null}
          {error ? <ErrorLine message={error} /> : null}
        </ScrollView>
      )}
      {winner ? (
        <BottomBar>
          <Button
            label={decided ? `Open the plan for ${winner.option.name}` : `Build the plan for ${winner.option.name}`}
            onPress={build}
            loading={saving}
            testID="build-plan"
          />
        </BottomBar>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingHorizontal: 16, paddingTop: 14, gap: 12, paddingBottom: BOTTOM_BAR_SPACE },
  note: { textAlign: 'center', marginTop: 4 },
});
