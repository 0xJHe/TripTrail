import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { addStop, deleteStop, updateStop } from '../api';
import { emptyForm, formFromStop, readStopForm, type StopFormValues } from '../stopForm';
import { planningKeys } from './usePlanning';
import { useDayPlan } from './useDayPlan';

/** Add a stop (stopId "new") or edit / delete an existing one. */
export function useStopForm(tripId: string, stopId: string, day: number) {
  const queryClient = useQueryClient();
  const plan = useDayPlan(tripId);
  const isNew = stopId === 'new';
  const stop = isNew ? null : (plan.stops.find((s) => s.id === stopId) ?? null);
  const [form, setForm] = useState<StopFormValues | null>(isNew ? emptyForm(day) : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the form once the stop has loaded.
  useEffect(() => {
    if (!form && stop) setForm(formFromStop(stop));
  }, [form, stop]);

  const set = (patch: Partial<StopFormValues>) => setForm((f) => (f ? { ...f, ...patch } : f));

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
    const read = readStopForm(form, plan.start, stop?.category ?? null);
    if (!read.ok) {
      setError(read.error);
      return;
    }
    if (stop) return run(() => updateStop(stop.id, read.fields));
    const sameDay = plan.stops.filter((s) => s.day_number === read.fields.day_number);
    const position = Math.max(-1, ...sameDay.map((s) => s.position)) + 1;
    return run(() =>
      addStop(tripId, { ...read.fields, position, lat: null, lng: null, tip: null, is_outdoor: false }),
    );
  }

  const remove = () => (stop ? run(() => deleteStop(stop.id)) : undefined);

  return {
    form,
    set,
    save,
    remove,
    isNew,
    days: plan.days,
    missing: !isNew && !plan.loading && !stop,
    saving,
    error,
  };
}
