import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { useSplitRows } from '@/features/group/hooks/useSplitRows';
import { splitEnded, splitStopProblem } from '@/features/group/splitStops';
import { useFinishedDays } from '@/features/recap/hooks/useFinishedDays';
import { now } from '@/lib/clock';
import { addStop, deleteStop, updateStop } from '../api';
import { placeCategory } from '../foodStop';
import { emptyForm, formFromStop, readStopForm, timeProblem, type StopFormValues } from '../stopForm';
import { planningKeys } from './usePlanning';
import { useDayPlan } from './useDayPlan';

/**
 * Add a stop (stopId "new") or edit / delete an existing one. splitId = group B's own stop
 * during that split ("+ Add a stop" on the split banner): it must end by the rejoin time.
 * A stop is saved on the day picked in the form (the day it was opened for); a day finished
 * for this person (Done for today, or the next day has started) can't get, lose or change stops.
 */
export const dayFinishedText = (day: number) => `Day ${day} is finished, so its plan can't be changed.`;

export function useStopForm(tripId: string, stopId: string, day: number, splitId: string | null = null) {
  const queryClient = useQueryClient();
  const plan = useDayPlan(tripId);
  const isNew = stopId === 'new';
  const stop = isNew ? null : (plan.stops.find((s) => s.id === stopId) ?? null);
  const splitOf = isNew ? splitId : (stop?.split_id ?? null);
  const splits = useSplitRows(splitOf ? tripId : undefined);
  const finished = useFinishedDays(tripId, plan.days);
  // The day the stop is on (editing) or was opened for (adding): finished = read-only.
  const locked = finished.isFinished(stop?.day_number ?? day);
  const split = splitOf ? (splits.data?.find((r) => r.id === splitOf) ?? null) : null;
  const [form, setForm] = useState<StopFormValues | null>(isNew ? emptyForm(day) : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown under the times after tapping Add stop / Save; gone once a time is picked again.
  const [timeError, setTimeError] = useState<string | null>(null);

  // Fill the form once the stop has loaded.
  useEffect(() => {
    if (!form && stop) setForm(formFromStop(stop));
  }, [form, stop]);

  function set(patch: Partial<StopFormValues>) {
    if ('time' in patch || 'endTime' in patch) setTimeError(null);
    setForm((f) => (f ? { ...f, ...patch } : f));
  }

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: planningKeys.stops(tripId) });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Check your internet and try again.');
      setSaving(false);
    }
  }

  function save() {
    if (!form) return;
    const closedDay = locked ? (stop?.day_number ?? day) : finished.isFinished(form.day) ? form.day : null;
    if (closedDay != null) {
      setError(dayFinishedText(closedDay));
      return;
    }
    const problem = timeProblem(form);
    setTimeError(problem);
    if (problem) return;
    const read = readStopForm(form, plan.start, stop ? { category: stop.category, name: stop.name } : null);
    if (!read.ok) {
      setError(read.error);
      return;
    }
    if (splitOf) {
      if (!split) {
        setError(splits.isLoading ? 'Still loading the split. Try again in a moment.' : 'This split has ended.');
        return;
      }
      if (isNew && splitEnded(split, now().getTime())) {
        setError('This split has ended. Add the stop to the plan instead.');
        return;
      }
      const late = splitStopProblem(read.fields.planned_time!, read.fields.planned_end!, split.rejoin_at);
      setTimeError(late);
      if (late) return;
    }
    if (stop) return run(() => updateStop(stop.id, read.fields));
    const sameDay = plan.stops.filter((s) => s.day_number === read.fields.day_number);
    const position = Math.max(-1, ...sameDay.map((s) => s.position)) + 1;
    return run(() =>
      addStop(tripId, { ...read.fields, position, tip: null, is_outdoor: false, split_id: splitOf }),
    );
  }

  const remove = () => {
    if (!stop) return;
    if (locked) return setError(dayFinishedText(stop.day_number));
    return run(() => deleteStop(stop.id));
  };

  return {
    form,
    set,
    save,
    remove,
    isNew,
    /** Days the stop can go on: the ones not finished for this person. */
    openDays: Array.from({ length: plan.days }, (_, i) => i + 1).filter((d) => !finished.isFinished(d)),
    /** The stop's day (or the day it was opened for) is finished: read-only. */
    locked,
    /** Middle of the plan's stops, to search places nearby. */
    near: centre(plan.stops),
    missing: !isNew && !plan.loading && !stop,
    saving,
    error,
    timeError,
    /** The stop being edited (null when adding). */
    stop,
    /** The category the stop will be saved with (food or not worked out as it's typed / picked). */
    category: form
      ? form.kind === 'place'
        ? placeCategory(form.name, form.place?.types, stop ? { category: stop.category, name: stop.name } : null)
        : form.kind
      : null,
    /** Someone in the trip needs halal food. */
    needsHalal: plan.needsHalal,
    /** Group B's own stop (added during a split). */
    isSplitStop: !!splitOf,
    /** Group B's own stop: when group B rejoins everyone (ISO), else null. */
    splitRejoinAt: split?.rejoin_at ?? null,
  };
}

/** Average location of the stops that have one. */
function centre(stops: { lat: number | null; lng: number | null }[]): { lat: number; lng: number } | null {
  const located = stops.filter((s) => s.lat != null && s.lng != null);
  if (!located.length) return null;
  return {
    lat: located.reduce((sum, s) => sum + s.lat!, 0) / located.length,
    lng: located.reduce((sum, s) => sum + s.lng!, 0) / located.length,
  };
}
