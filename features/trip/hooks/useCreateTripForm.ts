import { useMemo, useRef, useState } from 'react';

import { daysBetween, monthKey, rangeDates, todayISO, type ISODate, type MonthKey } from '@/features/planning/dates';
import { createTrip, updateTrip } from '../api';
import { DEFAULT_LENGTH, LENGTHS, type LengthChoice } from '../constants';
import { makeJoinCode } from '../joinCode';
import type { TripFields } from '../types';

/** State and saving for the create-trip form. The trip is saved the first time it's shared or created. */
export function useCreateTripForm(displayName: string) {
  const [name, setName] = useState('');
  const [knowsPlace, setKnowsPlace] = useState(false);
  const [destination, setDestination] = useState('');
  const [month, setMonth] = useState<MonthKey>(monthKey(todayISO()));
  const [length, setLength] = useState<LengthChoice>(DEFAULT_LENGTH);
  const [knowsDates, setKnowsDates] = useState(false);
  const [range, setRange] = useState<{ start: ISODate | null; end: ISODate | null }>({ start: null, end: null });
  const [calendarMonth, setCalendarMonth] = useState<MonthKey>(month);
  const [saved, setSaved] = useState<{ id: string; code: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable random tail so the preview code doesn't change on every keystroke.
  const seed = useRef([Math.random(), Math.random(), Math.random()]).current;
  const previewCode = useMemo(() => {
    let i = 0;
    return makeJoinCode(name, () => seed[i++ % seed.length]);
  }, [name, seed]);
  const joinCode = saved?.code ?? previewCode;

  const fixedDays = range.start && range.end ? daysBetween(range.start, range.end) + 1 : range.start ? 1 : 0;
  const selectedDates = useMemo(
    () => new Set(range.start ? rangeDates(range.start, range.end ?? range.start) : []),
    [range],
  );

  /** Tap 1 = first day, tap 2 = last day, tap 3 starts again. */
  function pressDay(date: ISODate) {
    setError(null);
    if (!range.start || range.end || date < range.start) setRange({ start: date, end: null });
    else setRange({ start: range.start, end: date });
  }

  function fields(): TripFields | string {
    const tripName = name.trim();
    if (!tripName) return 'Give the trip a name first.';
    if (knowsPlace && !destination.trim()) return 'Where are you going? Or pick "Let the group decide".';
    if (knowsDates && !range.start) return 'Tap the first and last day of the trip on the calendar.';
    const start = knowsDates ? range.start : null;
    const end = knowsDates ? (range.end ?? range.start) : null;
    return {
      name: tripName,
      destination: knowsPlace ? destination.trim() : null,
      month: start ? monthKey(start) : month,
      length_min: knowsDates ? fixedDays : length.min,
      length_days: knowsDates ? fixedDays : length.max,
      dates_fixed: knowsDates,
      start_date: start,
      end_date: end,
    };
  }

  /** Create the trip (or save edits). Returns null and sets `error` if the form isn't ready. */
  async function save(): Promise<{ id: string; code: string } | null> {
    const f = fields();
    if (typeof f === 'string') {
      setError(f);
      return null;
    }
    setSaving(true);
    setError(null);
    try {
      if (saved) {
        await updateTrip(saved.id, f);
        return saved;
      }
      const trip = await createTrip(f, displayName, previewCode);
      const result = { id: trip.id, code: trip.join_code };
      setSaved(result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the trip. Check your internet and try again.');
      return null;
    } finally {
      setSaving(false);
    }
  }

  return {
    name,
    setName: (v: string) => (setName(v), setError(null)),
    knowsPlace,
    setKnowsPlace,
    destination,
    setDestination: (v: string) => (setDestination(v), setError(null)),
    month,
    setMonth: (m: MonthKey) => (setMonth(m), setCalendarMonth(m)),
    length,
    setLength: (value: string) => setLength(LENGTHS.find((l) => l.value === value) ?? DEFAULT_LENGTH),
    knowsDates,
    setKnowsDates: (v: boolean) => (setKnowsDates(v), setError(null)),
    calendarMonth,
    setCalendarMonth,
    selectedDates,
    range,
    fixedDays,
    pressDay,
    joinCode,
    tripId: saved?.id ?? null,
    save,
    saving,
    error,
  };
}

export type CreateTripForm = ReturnType<typeof useCreateTripForm>;
