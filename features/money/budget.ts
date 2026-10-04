import type { Preferences, Stop } from '@/features/planning/types';

export interface BudgetSummary {
  /** Booked stops (already paid) plus stops the group has been to. Per person, RM. */
  spent: number;
  /** Every stop still in the plan, including what's spent. */
  planned: number;
  /** Group budget per person for the whole trip; null when nobody gave a daily budget. */
  budget: number | null;
  /** Bar widths, 0..1, against the bigger of budget and planned. */
  spentFill: number;
  plannedFill: number;
  /** How far the plan is over the budget (0 when within it). */
  over: number;
}

type BudgetStop = Pick<Stop, 'price' | 'actual_cost' | 'is_booked' | 'status'>;

/** What a stop cost: the amount entered after leaving it, else its price. */
const cost = (s: BudgetStop) => Number(s.actual_cost ?? s.price) || 0;

export function isSpent(s: BudgetStop): boolean {
  return s.is_booked || s.status === 'arrived' || s.status === 'done';
}

/**
 * The group budget, so the plan fits everyone: the lowest daily budget × days.
 * Members who haven't given a budget are ignored.
 */
export function groupBudget(prefs: Pick<Preferences, 'daily_budget'>[], days: number): number | null {
  const daily = prefs.map((p) => p.daily_budget).filter((b): b is number => b != null && b > 0);
  if (daily.length === 0 || days <= 0) return null;
  return Math.min(...daily) * days;
}

export function budgetSummary(stops: BudgetStop[], budget: number | null): BudgetSummary {
  const inPlan = stops.filter((s) => s.status !== 'dropped');
  const spent = round(inPlan.filter(isSpent).reduce((sum, s) => sum + cost(s), 0));
  const planned = round(inPlan.reduce((sum, s) => sum + cost(s), 0));
  const scale = Math.max(budget ?? 0, planned);
  return {
    spent,
    planned,
    budget,
    spentFill: scale > 0 ? Math.min(1, spent / scale) : 0,
    plannedFill: scale > 0 ? Math.min(1, planned / scale) : 0,
    over: budget != null && planned > budget ? round(planned - budget) : 0,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
