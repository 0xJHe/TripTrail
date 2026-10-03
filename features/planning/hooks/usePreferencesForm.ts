import { useEffect, useMemo, useState } from 'react';

import type { Trip } from '@/features/trip/types';
import { ANYTHING, MAX_MUST_HAVES } from '../constants';
import { monthKey, rangeDates, todayISO, type ISODate, type MonthKey } from '../dates';
import type { PreferencesInput } from '../api';
import type { Preferences } from '../types';

/** Month the calendar opens on: my first free day, the fixed trip dates, or the trip's month. */
function startMonth(trip: Trip | undefined, mine: Preferences | undefined): MonthKey {
  const now = monthKey(todayISO());
  const candidate = mine?.free_dates[0]?.slice(0, 7) ?? trip?.start_date?.slice(0, 7) ?? trip?.month ?? now;
  return candidate < now ? now : candidate;
}

export function usePreferencesForm(trip: Trip | undefined, mine: Preferences | undefined, memberId: string | null) {
  const [budget, setBudget] = useState('');
  const [dates, setDates] = useState<Set<ISODate>>(new Set());
  const [food, setFood] = useState<string[]>([]);
  const [mustHaves, setMustHaves] = useState<string[]>([]);
  const [noGo, setNoGo] = useState<string | null>(null);
  const [month, setMonth] = useState<MonthKey>(monthKey(todayISO()));
  const [loaded, setLoaded] = useState(false);

  // Fill the form once, from my saved answers or the trip's fixed dates.
  useEffect(() => {
    if (loaded || !trip) return;
    if (mine) {
      setBudget(mine.daily_budget != null ? String(Math.round(mine.daily_budget)) : '');
      setDates(new Set(mine.free_dates));
      setFood(mine.food_needs);
      setMustHaves(mine.must_haves);
      setNoGo(mine.no_go);
    } else if (trip.dates_fixed && trip.start_date && trip.end_date) {
      setDates(new Set(rangeDates(trip.start_date, trip.end_date)));
    }
    setMonth(startMonth(trip, mine));
    setLoaded(true);
  }, [trip, mine, loaded]);

  const budgetNumber = Number(budget);
  const problem = !budget || !(budgetNumber > 0)
    ? 'Add your daily budget'
    : dates.size === 0
      ? 'Tap the days you can travel'
      : null;

  function toggleDate(date: ISODate) {
    setDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  /** "Anything" can't be combined with other food needs. */
  function toggleFood(item: string) {
    setFood((prev) => {
      if (prev.includes(item)) return prev.filter((f) => f !== item);
      if (item === ANYTHING) return [ANYTHING];
      return [...prev.filter((f) => f !== ANYTHING), item];
    });
  }

  function toggleMustHave(item: string) {
    setMustHaves((prev) => {
      if (prev.includes(item)) return prev.filter((m) => m !== item);
      if (prev.length >= MAX_MUST_HAVES) return prev;
      return [...prev, item];
    });
  }

  const input = useMemo<PreferencesInput | null>(() => {
    if (problem || !trip || !memberId) return null;
    return {
      member_id: memberId,
      trip_id: trip.id,
      daily_budget: budgetNumber,
      free_dates: [...dates].sort(),
      food_needs: food,
      must_haves: mustHaves,
      no_go: noGo,
    };
  }, [problem, trip, memberId, budgetNumber, dates, food, mustHaves, noGo]);

  return {
    budget,
    setBudget: (v: string) => setBudget(v.replace(/[^0-9]/g, '').slice(0, 5)),
    dates,
    toggleDate,
    month,
    setMonth,
    food,
    toggleFood,
    mustHaves,
    toggleMustHave,
    noGo,
    toggleNoGo: (item: string) => setNoGo((prev) => (prev === item ? null : item)),
    problem,
    input,
  };
}
