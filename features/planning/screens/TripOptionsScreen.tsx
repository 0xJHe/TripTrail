import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatars } from '@/components/ui/Avatars';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { memberAvatars } from '@/features/trip/members';
import { colors } from '@/lib/theme';
import { castVote } from '../api';
import { DeckActions } from '../components/DeckActions';
import { DetailsSheet } from '../components/DetailsSheet';
import { NoteLine } from '../components/NoteLine';
import { SwipeDeck, type SwipeDeckHandle } from '../components/SwipeDeck';
import { WaitingForAnswers } from '../components/WaitingForAnswers';
import { useGenerateOptions } from '../hooks/useGenerateOptions';
import { usePlanningData } from '../hooks/usePlanningData';
import type { TripOption } from '../types';

export function TripOptionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const data = usePlanningData(id);
  const gen = useGenerateOptions(data);
  const deck = useRef<SwipeDeckHandle>(null);
  const [swiped, setSwiped] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(0);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [details, setDetails] = useState<TripOption | null>(null);

  const { me, options, votes } = data;
  const myVoted = new Set(votes.filter((v) => v.member_id === me?.id).map((v) => v.option_id));
  const remaining = options.filter((o) => !myVoted.has(o.id) && !swiped.has(o.id));
  const done = !gen.waiting && options.length > 0 && remaining.length === 0;

  // Everything swiped and saved: show the results.
  useEffect(() => {
    if (done && pending === 0) router.replace(`/trip/${id}/results`);
  }, [done, pending, id]);

  async function onSwipe(option: TripOption, liked: boolean) {
    if (!me) return;
    setSwiped((s) => new Set(s).add(option.id));
    setPending((n) => n + 1);
    setVoteError(null);
    try {
      await castVote({ member_id: me.id, option_id: option.id, trip_id: id, liked });
      await queryClient.invalidateQueries({ queryKey: ['votes', id] });
    } catch {
      // Put the card back so the vote isn't lost.
      setSwiped((s) => {
        const next = new Set(s);
        next.delete(option.id);
        return next;
      });
      setVoteError("Couldn't save that swipe. Check your internet and try again.");
    } finally {
      setPending((n) => n - 1);
    }
  }

  const position = options.length - remaining.length + 1;
  const subtitle = gen.waiting
    ? 'Swipe right to like, left to pass'
    : `Swipe right to like, left to pass · ${Math.min(position, options.length)} of ${options.length}`;

  return (
    <View style={styles.screen}>
      <NavyHeader
        title="Pick a trip"
        subtitle={subtitle}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      />
      <View style={[styles.body, { paddingBottom: insets.bottom + 16 }]}>
        {data.loading || !data.trip ? (
          <View style={styles.center}>
            {data.error ? <ErrorLine message="Couldn't load the trip options." /> : <ActivityIndicator color={colors.teal} />}
          </View>
        ) : gen.waiting ? (
          <WaitingForAnswers
            members={data.members}
            answeredIds={data.answeredIds}
            generating={gen.generating || (data.trip.stage === 'voting' && !gen.error)}
            error={gen.error}
            onBuildNow={gen.generate}
            onEditAnswers={() => router.replace(`/trip/${id}/preferences`)}
          />
        ) : (
          <>
            <View style={styles.between}>
              <Txt variant="s11">Built from {data.solo ? 'your' : "everyone's"} answers</Txt>
              <Avatars people={memberAvatars(data.members, (m) => !data.answeredIds.has(m.id))} />
            </View>
            {options[0]?.plan_json.fitNote ? <NoteLine text={options[0].plan_json.fitNote} /> : null}
            <SwipeDeck
              ref={deck}
              options={remaining}
              fits={data.fits}
              solo={data.solo}
              needsHalal={data.needsHalal}
              onSwipe={onSwipe}
            />
            {voteError ? <ErrorLine message={voteError} /> : null}
            <DeckActions
              disabled={remaining.length === 0}
              onPass={() => deck.current?.swipe(false)}
              onLike={() => deck.current?.swipe(true)}
              onDetails={() => setDetails(remaining[0] ?? null)}
            />
          </>
        )}
      </View>
      <DetailsSheet option={details} fit={details ? data.fits.get(details.id) : undefined} onClose={() => setDetails(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
