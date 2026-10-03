import type { Trip } from '@/features/trip/types';
import { findBestWindow, type DateWindow } from './dateFinder';
import type { Preferences, TripOption } from './types';

/** Members whose daily budget × trip days is less than the trip's cost. */
export function overBudgetCount(costPerPerson: number, days: number, prefs: Preferences[]): number {
  return prefs.filter((p) => p.daily_budget != null && p.daily_budget * days < costPerPerson).length;
}

/** How many of the group's must-haves (all members combined) this option covers. */
export function mustHaveCoverage(covers: string[], prefs: Preferences[]): { covered: number; total: number } {
  const wanted = new Set(prefs.flatMap((p) => p.must_haves));
  const covered = [...wanted].filter((m) => covers.includes(m)).length;
  return { covered, total: wanted.size };
}

export function someoneNeeds(prefs: Preferences[], food: string): boolean {
  return prefs.some((p) => p.food_needs.includes(food));
}

export interface OptionFit {
  window: DateWindow | null;
  overBudget: number;
  mustHaves: { covered: number; total: number };
  /** Everyone is free and nobody is over budget. */
  fitsEveryone: boolean;
}

/** Work out dates, budget and must-haves for one option from everyone's answers. */
export function optionFit(
  option: Pick<TripOption, 'cost_per_person' | 'plan_json'>,
  prefs: Preferences[],
  totalMembers: number,
  trip?: Pick<Trip, 'dates_fixed' | 'start_date' | 'end_date'>,
): OptionFit {
  const days = option.plan_json.days;
  const within =
    trip?.dates_fixed && trip.start_date && trip.end_date ? { start: trip.start_date, end: trip.end_date } : undefined;
  const window = findBestWindow(
    prefs.map((p) => ({ memberId: p.member_id, freeDates: p.free_dates })),
    totalMembers,
    days,
    within,
  );
  const overBudget = overBudgetCount(option.cost_per_person, days, prefs);
  return {
    window,
    overBudget,
    mustHaves: mustHaveCoverage(option.plan_json.covers, prefs),
    fitsEveryone: !!window && window.freeCount >= totalMembers && overBudget === 0,
  };
}

/** Members who have saved their answers. */
export function answered(prefs: Preferences[]): Preferences[] {
  return prefs.filter((p) => p.daily_budget != null && p.free_dates.length > 0);
}
