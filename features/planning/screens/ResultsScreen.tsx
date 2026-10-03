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
import { finishedSwiping, likesLabel, rankOptions, tieBreakReason, tiedWithTop } from '../tally';

export function ResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const setCurrentTrip = useCurrentTrip((s) => s.setCurrentTrip);
  const data = usePlanningData(id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const { trip, members, options, votes, fits, solo } = data;
  const ranked = options.length && fits.size === options.length ? rankOptions(options, votes, fits) : [];
  const decided = trip?.stage === 'decided';
  // Once picked, the chosen trip stays on top even if votes change later.
  const top = (decided && ranked.find((r) => r.option.id === trip?.winning_option_id)) || ranked[0];
  const runnersUp = ranked.filter((r) => r !== top);
  // Any trip in the list can be picked instead, before or after the plan is built.
  const selected = ranked.find((r) => r.option.id === pickedId) ?? top;
  const switching = decided && !!selected && selected.option.id !== trip?.winning_option_id;
  const tied = tiedWithTop(ranked);
  const doneIds = finishedSwiping(options, votes, members.map((m) => m.id));
  const waitingFor = members.filter((m) => !doneIds.includes(m.id));
  const everyoneDone = members.length > 0 && waitingFor.length === 0;

  const title = solo
    ? "You've swiped"
    : everyoneDone
      ? "Everyone's swiped"
      : `${doneIds.length} of ${members.length} have swiped`;

  let tag = 'Picked';
  if (!decided && top) {
    tag = tied.length ? `Tied · ${likesLabel(top.likes)} each` : `Winner · ${top.likes} of ${members.length} liked`;
  }

  let buttonLabel = '';
  if (selected) {
    const name = selected.option.name;
    buttonLabel = switching
      ? `Switch the plan to ${name}`
      : decided
        ? `Open the plan for ${name}`
        : `Build the plan for ${name}`;
  }

  async function build() {
    if (!selected || !trip) return;
    setSaving(true);
    setError(null);
    try {
      if (!decided || switching) await chooseWinner(trip.id, selected.option, selected.fit.window);
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
      {data.loading || !top ? (
        <View style={styles.center}>
          {data.error ? <ErrorLine message="Couldn't load the results." /> : <ActivityIndicator color={colors.teal} />}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <WinnerCard
            result={top}
            members={members}
            tag={tag}
            selected={selected === top}
            onPress={() => setPickedId(top.option.id)}
          />
          {!decided && tied.length ? (
            <Txt variant="s11">
              Tied on {likesLabel(top.likes)} with {joinNames(tied.map((r) => r.option.name))}. {top.option.name} is
              first because {tieBreakReason(top, tied[0], solo)}.
            </Txt>
          ) : null}
          {runnersUp.length ? (
            <View style={styles.between}>
              <Txt variant="lbl">Runners-up</Txt>
              <Txt variant="s11">Tap a trip to pick it instead</Txt>
            </View>
          ) : null}
          {runnersUp.map((r) => (
            <RunnerUpRow
              key={r.option.id}
              result={r}
              members={members}
              solo={solo}
              selected={selected === r}
              onPress={() => setPickedId(r.option.id)}
            />
          ))}
          {!everyoneDone && !decided ? (
            <Txt variant="s11" style={styles.note}>
              Still swiping: {waitingFor.map((m) => m.display_name).join(', ')}. Results update live.
            </Txt>
          ) : null}
          {error ? <ErrorLine message={error} /> : null}
        </ScrollView>
      )}
      {selected ? (
        <BottomBar>
          <Button label={buttonLabel} onPress={build} loading={saving} testID="build-plan" />
        </BottomBar>
      ) : null}
    </View>
  );
}

/** "Melaka", "Melaka and Ipoh", "Melaka, Langkawi and Singapore" */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingHorizontal: 16, paddingTop: 14, gap: 12, paddingBottom: BOTTOM_BAR_SPACE },
  note: { textAlign: 'center', marginTop: 4 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
