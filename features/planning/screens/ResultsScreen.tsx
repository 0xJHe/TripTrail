import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Avatars } from '@/components/ui/Avatars';
import { BottomBar, BOTTOM_BAR_SPACE } from '@/components/ui/BottomBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { memberAvatars, memberCountLabel } from '@/features/trip/members';
import { colors } from '@/lib/theme';
import { agreedOption, choiceLine, choosersByOption } from '../choice';
import { ChooseBar } from '../components/ChooseBar';
import { RunnerUpRow } from '../components/RunnerUpRow';
import { WinnerCard } from '../components/WinnerCard';
import { useChooseTrip } from '../hooks/useChooseTrip';
import { usePlanningData } from '../hooks/usePlanningData';
import { finishedSwiping, likesLabel, rankOptions, tiedWithTop, type OptionResult } from '../tally';

export function ResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = usePlanningData(id);
  const { choose, choosingId, build, building, error, openPlan } = useChooseTrip(data);

  const { trip, members, me, options, votes, fits, solo } = data;
  const ranked = options.length && fits.size === options.length ? rankOptions(options, votes, fits) : [];
  const decided = trip?.stage === 'decided';
  // Once the plan is built, the planned trip stays on top.
  const top = (decided && ranked.find((r) => r.option.id === trip?.winning_option_id)) || ranked[0];
  const others = ranked.filter((r) => r !== top);
  const tied = tiedWithTop(ranked);
  const doneIds = finishedSwiping(options, votes, members.map((m) => m.id));
  const stillSwiping = members.filter((m) => !doneIds.includes(m.id));

  const avatars = memberAvatars(members);
  const chosenBy = choosersByOption(members);
  const agreedId = agreedOption(members);
  const agreed = ranked.find((r) => r.option.id === agreedId);
  const myChoice = me?.chosen_option_id ?? null;
  const line = choiceLine(members, ranked.map((r) => ({ id: r.option.id, name: r.option.name })));

  let tag = 'Planned';
  if (!decided && top) {
    tag = tied.length ? `Tied · ${likesLabel(top.likes)} each` : `Most liked · ${top.likes} of ${members.length}`;
  }

  const footer = (r: OptionResult) =>
    decided ? null : (
      <ChooseBar
        optionName={r.option.name}
        choosers={avatars.filter((a) => chosenBy.get(r.option.id)?.includes(a.key))}
        mine={myChoice === r.option.id}
        onChoose={() => choose(r.option.id)}
        disabled={!!choosingId}
      />
    );

  return (
    <View style={styles.screen}>
      <NavyHeader
        title={decided ? 'Trip chosen' : solo ? 'Choose your trip' : 'Choose a trip together'}
        subtitle={`${options.length} trip${options.length === 1 ? '' : 's'} · ${memberCountLabel(members.length)}`}
        onBack={() => router.replace('/home')}
      />
      {data.loading || !top ? (
        <View style={styles.center}>
          {data.error ? <ErrorLine message="Couldn't load the results." /> : <ActivityIndicator color={colors.teal} />}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {!decided ? (
            <Card style={styles.summary}>
              <View style={{ flex: 1 }}>
                <Txt variant="h14">{line}</Txt>
                <Txt variant="s11" style={{ marginTop: 2 }}>
                  {solo
                    ? 'Likes are only a guide. Choose the trip you want.'
                    : 'Likes are only a guide. Each of you chooses a trip; you can change any time.'}
                </Txt>
              </View>
              {!solo ? <Avatars people={avatars.map((a) => ({ ...a, muted: !members.find((m) => m.id === a.key)?.chosen_option_id }))} size={24} /> : null}
            </Card>
          ) : null}
          <WinnerCard result={top} members={members} tag={tag} chosen={myChoice === top.option.id} footer={footer(top)} />
          {others.length ? <Txt variant="lbl">Other trips</Txt> : null}
          {others.map((r) => (
            <RunnerUpRow
              key={r.option.id}
              result={r}
              members={members}
              solo={solo}
              chosen={myChoice === r.option.id}
              footer={footer(r)}
            />
          ))}
          {stillSwiping.length && !decided && !solo ? (
            <Txt variant="s11" style={styles.note}>
              Still swiping: {stillSwiping.map((m) => m.display_name).join(', ')}. Likes update live.
            </Txt>
          ) : null}
          {error ? <ErrorLine message={error} /> : null}
        </ScrollView>
      )}
      {top ? (
        <BottomBar>
          {decided ? (
            <Button label="Open the Day plan" onPress={openPlan} testID="open-plan" />
          ) : agreed ? (
            <Button label={`Build the plan for ${agreed.option.name}`} onPress={() => build(agreed)} loading={building} testID="build-plan" />
          ) : (
            <>
              <Txt variant="s11" style={styles.note}>
                {solo ? 'Choose a trip to build the plan' : 'Waiting for everyone to choose the same trip'}
              </Txt>
              <Button label="Build the plan" disabled testID="build-plan" />
            </>
          )}
        </BottomBar>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingHorizontal: 16, paddingTop: 14, gap: 12, paddingBottom: BOTTOM_BAR_SPACE + 24 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  note: { textAlign: 'center' },
});
