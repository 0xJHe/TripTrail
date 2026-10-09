import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import type { Stop } from '@/features/planning/types';
import { useMyMember } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { now, useNow } from '@/lib/clock';
import { addExtraSpend, deleteSpend, fetchSpends, saveSpend } from '../api';
import {
  doneCostLabel,
  extraRow,
  isBookedStop,
  myExtras,
  mySpends,
  spendCheckFor,
  spendRow,
  spendsAt,
  spentSoFarLabel,
} from '../spend';
import type { Spend, SpendAnswer } from '../types';

export const spendKeys = {
  spends: (tripId: string) => ['spends', tripId] as const,
};

/**
 * Everyone's spends that count now (see spendsAt), this person's spend-check answers by stop,
 * and their extra spends. Kept live with Realtime, so the budget bar and "Spent so far" update.
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
  const extras = useMemo(() => myExtras(all, me?.id ?? null), [all, me?.id]);
  return { all, mine, extras, me };
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
        ...old.filter((s) => !(s.stop_id === row.stop_id && s.member_id === row.member_id && s.day_number === row.day_number)),
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
    /** A booking (hotel, flights): asks about extras on top, guess RM 0. */
    booked: stop ? isBookedStop(stop) : false,
    answer,
    saving,
    note: failed && failed === stopId ? "Couldn't save that. Check the connection and try again." : null,
    /** "RM 18" once answered, else "~RM 16". */
    costOf: (s: Stop) => doneCostLabel(s, mine.get(s.id)),
    /** "Spent so far RM 52 · 3 of 4" in a group trip. */
    soFarOf: (s: Stop) => spentSoFarLabel(all, s.id, groupSize, isBookedStop(s)),
  };
}

export type SpendCheckState = ReturnType<typeof useSpendCheck>;

/** "+ Add spend" on the Plan tab: this person's extra spends for a day, add and delete. */
export function useExtraSpends(tripId: string | undefined, day: number) {
  const queryClient = useQueryClient();
  const { extras, me } = useSpends(tripId);
  const [busy, setBusy] = useState<'add' | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = spendKeys.spends(tripId ?? '');

  const run = async (what: 'add' | string, act: () => Promise<void>): Promise<boolean> => {
    setBusy(what);
    setError(null);
    try {
      await act();
      return true;
    } catch (e) {
      console.warn('Saving the extra spend failed:', e instanceof Error ? e.message : e);
      setError("Couldn't save that. Check the connection and try again.");
      return false;
    } finally {
      setBusy(null);
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  return {
    /** This day's extra spends. */
    list: extras.filter((e) => e.day_number === day),
    busy,
    error,
    canAdd: !!tripId && !!me,
    add: (amount: number, note: string) =>
      run('add', () => addExtraSpend(extraRow(tripId!, me!.id, day, amount, note, now()))),
    remove: (id: string) => run(id, () => deleteSpend(id)),
  };
}
