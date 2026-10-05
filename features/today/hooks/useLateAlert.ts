import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { planningKeys } from '@/features/planning/hooks/usePlanning';
import type { Stop } from '@/features/planning/types';
import { now } from '@/lib/clock';
import { getGroupLocation } from '@/lib/location';
import { AI_FAILED_NOTE } from '@/supabase/functions/_shared/replan';
import { askReplan, decideNewDay } from '../api';
import { openAlertFor } from '../late';
import type { LateAlert } from '../types';
import { lateKeys, useLateAlerts } from './useLateCheck';

/** The running-late card for the stop the group is heading to, and its buttons. */
export function useLateAlert(tripId: string | undefined, next: Stop | null) {
  const queryClient = useQueryClient();
  const alerts = useLateAlerts(tripId);
  const alert = openAlertFor(alerts.data ?? [], next);
  const [simple, setSimple] = useState(false);
  const [asking, setAsking] = useState(false);
  const [deciding, setDeciding] = useState<'accept' | 'keep' | null>(null);
  const [note, setNote] = useState<{ stopId: string; text: string } | null>(null);

  const ai = alert?.ai_plan ?? null;
  const showingAi = !!ai && !simple;
  const stopId = alert?.stop_id;

  const refresh = useCallback(() => {
    if (!tripId) return;
    queryClient.invalidateQueries({ queryKey: lateKeys.alerts(tripId) });
    queryClient.invalidateQueries({ queryKey: planningKeys.stops(tripId) });
  }, [tripId, queryClient]);

  /** "Ask AI for a better plan": one phone asks Gemini, the plan shows on everyone's card. */
  const askAi = useCallback(async () => {
    if (!tripId || !stopId) return;
    setAsking(true);
    setNote(null);
    setSimple(false);
    try {
      const loc = await getGroupLocation();
      const reply = await askReplan(tripId, stopId, now(), loc?.center ?? null);
      if (reply.plan) {
        const plan = reply.plan;
        queryClient.setQueryData<LateAlert[]>(lateKeys.alerts(tripId), (old) =>
          old?.map((a) => (a.stop_id === stopId ? { ...a, ai_plan: plan } : a)),
        );
      } else {
        setNote({ stopId, text: reply.note ?? AI_FAILED_NOTE });
      }
    } catch (e) {
      console.warn('replan-day failed:', e instanceof Error ? e.message : e);
      setNote({ stopId, text: AI_FAILED_NOTE });
    } finally {
      setAsking(false);
    }
  }, [tripId, stopId, queryClient]);

  /** Accept the plan on screen, or keep the original. Closes the card for the whole group. */
  const decide = useCallback(
    async (choice: 'rules' | 'ai' | 'keep') => {
      if (!stopId) return;
      setDeciding(choice === 'keep' ? 'keep' : 'accept');
      try {
        await decideNewDay(stopId, choice);
      } catch (e) {
        console.warn('Saving the new day failed:', e instanceof Error ? e.message : e);
        setNote({ stopId, text: "Couldn't save that. Check the connection and try again." });
      } finally {
        setDeciding(null);
        refresh();
      }
    },
    [stopId, refresh],
  );

  return {
    alert,
    plan: alert ? (showingAi ? ai! : alert.plan) : null,
    showingAi,
    hasAi: !!ai,
    toggleAi: () => setSimple((s) => !s),
    askAi,
    asking,
    note: note && note.stopId === stopId ? note.text : null,
    accept: () => decide(showingAi ? 'ai' : 'rules'),
    keep: () => decide('keep'),
    deciding,
  };
}

export type LateState = ReturnType<typeof useLateAlert>;
