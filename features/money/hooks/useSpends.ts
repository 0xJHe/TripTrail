import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import type { Stop } from '@/features/planning/types';
import { useMyMember } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { now, useNow } from '@/lib/clock';
import { fetchSpends, saveSpend } from '../api';
import { doneCostLabel, mySpends, spendCheckFor, spendRow, spendsAt, spentSoFarLabel } from '../spend';
import type { Spend, SpendAnswer } from '../types';

export const spendKeys = {
  spends: (tripId: string) => ['spends', tripId] as const,
};

/**
 * Everyone's spend-check answers that count now (see spendsAt), and this person's by stop.
 * Kept live with Realtime, so the budget bar and "Spent so far" update as people answer.
 */
export function useSpends(tripId: string | undefined) {
  const query = useQuery({
    queryKey: spendKeys.spends(tripId ?? ''),
    queryFn: () => fetchSpends(tripId!),
    enabled: !!tripId,
  });
  useTripRealtime(tripId, ['spends']);
  const me = useMyMember(tripId);
  const time = useNow().getTime();
  const all = useMemo(() => spendsAt(query.data ?? [], time), [query.data, time]);
  const mine = useMemo(() => mySpends(all, me?.id ?? null), [all, me?.id]);
  return { all, mine, me };
}

/** The spend check for today's stops (prototype screen 9), and the Done list's costs. */
export function useSpendCheck(tripId: string | undefined, dayStops: Stop[], groupSize: number) {
  const queryClient = useQueryClient();
  const { all, mine, me } = useSpends(tripId);
  const time = useNow().getTime();
  const stop = useMemo(() => spendCheckFor(dayStops, mine, time), [dayStops, mine, time]);
  const [saving, setSaving] = useState<SpendAnswer['kind'] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const stopId = stop?.id;

  const answer = useCallback(
    async (a: SpendAnswer) => {
      if (!stop || !me || !tripId) return;
      const key = spendKeys.spends(tripId);
      const row = spendRow(a, stop, me.id, now());
      setSaving(a.kind);
      setFailed(null);
      // Show the answer straight away; the stop moves to Done.
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<Spend[]>(key, (old = []) => [
        ...old.filter((s) => !(s.stop_id === row.stop_id && s.member_id === row.member_id)),
        { ...row, id: `local-${row.stop_id}` },
      ]);
      try {
        await saveSpend(row);
      } catch (e) {
        console.warn('Saving the spend failed:', e instanceof Error ? e.message : e);
        setFailed(stop.id);
      } finally {
        setSaving(null);
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [stop, me, tripId, queryClient],
  );

  return {
    /** The stop to ask about, or null. */
    stop,
    answer,
    saving,
    note: failed && failed === stopId ? "Couldn't save that. Check the connection and try again." : null,
    /** "RM 18" once answered, else "~RM 16". */
    costOf: (s: Stop) => doneCostLabel(s, mine.get(s.id)),
    /** "Spent so far RM 52 · 3 of 4" in a group trip. */
    soFarOf: (s: Stop) => spentSoFarLabel(all, s.id, groupSize),
  };
}

export type SpendCheckState = ReturnType<typeof useSpendCheck>;
