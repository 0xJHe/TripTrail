import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { fetchPins } from '@/features/group/api';
import { pinKeys } from '@/features/group/hooks/usePinSpot';
import { useSplitRows } from '@/features/group/hooks/useSplitRows';
import { pinForm } from '@/features/group/pins';
import { splitEnded, splitStopProblem } from '@/features/group/splitStops';
import { useFinishedDays } from '@/features/recap/hooks/useFinishedDays';
import { now } from '@/lib/clock';
import { addStop, deleteStop, shiftStops, updateStop } from '../api';
import { placeCategory } from '../foodStop';
import { checkOverlap, type OverlapCheck } from '../overlap';
import { emptyForm, formFromStop, readStopForm, timePassedProblem, timeProblem, type StopFields, type StopFormValues } from '../stopForm';
import { planningKeys } from './usePlanning';
import { useDayPlan } from './useDayPlan';

/**
 * Add a stop (stopId "new") or edit / delete an existing one. splitId = group B's own stop
 * during that split ("+ Add a stop" on the split banner): it must end by the rejoin time.
 * A stop is saved on the day picked in the form (the day it was opened for); a day finished
 * for this person (Done for today, or the next day has started) can't get, lose or change stops.
 * pinId = a pin's "Add to plan": the form starts with the pin's name and location.
 * Every way in (Add a stop, + Add more stops, a pin's Add to plan, group B's stops) saves here,
 * so all of them refuse a start time that has already passed (timePassedProblem, now()); an
 * edit only when its start time changes.
 * New times that overlap another stop on the day (this person's view of the plan) aren't saved
 * straight away: `overlap` says which stop, and shiftAndSave() moves the later stops to make
 * room (for everyone), then saves.
 */
export const dayFinishedText = (day: number) => `Day ${day} is finished, so its plan can't be changed.`;

type Overlap = Extract<OverlapCheck, { ok: false }>;

export function useStopForm(
  tripId: string,
  stopId: string,
  day: number,
  splitId: string | null = null,
  pinId: string | null = null,
) {
  const queryClient = useQueryClient();
  const plan = useDayPlan(tripId);
  const isNew = stopId === 'new';
  const stop = isNew ? null : (plan.stops.find((s) => s.id === stopId) ?? null);
  const splitOf = isNew ? splitId : (stop?.split_id ?? null);
  const splits = useSplitRows(splitOf ? tripId : undefined);
  const fromPin = isNew && !!pinId;
  const pins = useQuery({ queryKey: pinKeys.pins(tripId), queryFn: () => fetchPins(tripId), enabled: fromPin });
  const finished = useFinishedDays(tripId, plan.days);
  // The day the stop is on (editing) or was opened for (adding): finished = read-only.
  const locked = finished.isFinished(stop?.day_number ?? day);
  const split = splitOf ? (splits.data?.find((r) => r.id === splitOf) ?? null) : null;
  const [form, setForm] = useState<StopFormValues | null>(isNew && !fromPin ? emptyForm(day) : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown under the times after tapping Add stop / Save; gone once a time is picked again.
  const [timeError, setTimeError] = useState<string | null>(null);
  // The times overlap another stop (with what Shift later stops would save); gone once a time or the day changes.
  const [overlap, setOverlap] = useState<{ check: Overlap; fields: StopFields } | null>(null);

  // Fill the form once the stop (or the pin being added) has loaded.
  const pin = fromPin ? (pins.data?.find((p) => p.id === pinId) ?? null) : null;
  const pinsDone = !pins.isLoading;
  useEffect(() => {
    if (form) return;
    if (stop) setForm(formFromStop(stop));
    else if (fromPin && pinsDone) setForm(pin ? pinForm(pin, day) : emptyForm(day));
  }, [form, stop, fromPin, pinsDone, pin, day]);

  function set(patch: Partial<StopFormValues>) {
    if ('time' in patch || 'endTime' in patch) setTimeError(null);
    if ('time' in patch || 'endTime' in patch || 'day' in patch) setOverlap(null);
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
    const fields = read.fields;
    const passed = timePassedProblem(fields.planned_time!, now().getTime(), stop ? stop.planned_time : null);
    setTimeError(passed);
    if (passed) return;
    if (splitOf) {
      if (!split) {
        setError(splits.isLoading ? 'Still loading the split. Try again in a moment.' : 'This split has ended.');
        return;
      }
      if (isNew && splitEnded(split, now().getTime())) {
        setError('This split has ended. Add the stop to the plan instead.');
        return;
      }
      const late = splitStopProblem(fields.planned_time!, fields.planned_end!, split.rejoin_at);
      setTimeError(late);
      if (late) return;
    }
    // Editing: only new times or a new day are checked, so fixing a price never gets stuck on an old overlap.
    const retimed =
      !stop ||
      stop.planned_time !== fields.planned_time ||
      stop.planned_end !== fields.planned_end ||
      stop.day_number !== fields.day_number;
    if (retimed) {
      const check = checkOverlap(
        { id: stop?.id, day_number: fields.day_number, planned_time: fields.planned_time!, planned_end: fields.planned_end! },
        plan.stops,
      );
      if (!check.ok) {
        setOverlap({ check, fields });
        return;
      }
    }
    setOverlap(null);
    return run(() => write(fields));
  }

  function write(fields: StopFields) {
    if (stop) return updateStop(stop.id, fields);
    const sameDay = plan.stops.filter((s) => s.day_number === fields.day_number);
    const position = Math.max(-1, ...sameDay.map((s) => s.position)) + 1;
    return addStop(tripId, { ...fields, position, tip: null, is_outdoor: false, split_id: splitOf });
  }

  /** Shift later stops: move the overlapping stop and the later ones (for everyone), then save this one. */
  function shiftAndSave() {
    const moves = overlap?.check.moves;
    if (!overlap || !moves) return;
    const { fields } = overlap;
    if (finished.isFinished(fields.day_number)) return setError(dayFinishedText(fields.day_number));
    return run(async () => {
      // Moves first: if saving the stop then fails, tapping again finds no overlap and just saves it.
      await shiftStops(moves);
      await write(fields);
    });
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
    shiftAndSave,
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
    /** The new times overlap another stop on the day (nothing saved yet), else null. */
    overlap: overlap?.check ?? null,
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
