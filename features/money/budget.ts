import type { Preferences, Stop } from '@/features/planning/types';
import { isBookedStop, knownCost, needsSpendCheck } from './spend';
import type { Spend } from './types';

export interface BudgetSummary {
  /** Booked stops (already paid), amounts confirmed in the spend check, and visited fixed-price stops. Per person, RM. */
  spent: number;
  /** Every stop still in the plan, at the confirmed amount where known, else the estimate. */
  planned: number;
  /** Group budget per person for the whole trip; null when nobody gave a daily budget. */
  budget: number | null;
  /** Bar widths, 0..1, against the bigger of budget and planned. */
  spentFill: number;
  plannedFill: number;
  /** How far the plan is over the budget (0 when within it). */
  over: number;
}

type BudgetStop = Pick<Stop, 'id' | 'price' | 'actual_cost' | 'is_booked' | 'is_estimate' | 'category' | 'status'>;

/**
 * Whether a stop's cost counts as spent: booked stops (hotel, flights), stops with a known
 * amount (confirmed in the spend check), and visited stops with a fixed price (nothing to
 * check). A visited stop with only an estimate (not answered yet, or skipped) is planned, not spent.
 */
export function isSpent(s: BudgetStop, known: number | null = null): boolean {
  if (isBookedStop(s) || known != null) return true;
  return (s.status === 'arrived' || s.status === 'done') && !needsSpendCheck(s);
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

/** The budget bar for this person: `mine` = their spend-check answers by stop id. */
export function budgetSummary(stops: BudgetStop[], budget: number | null, mine: Map<string, Spend> = new Map()): BudgetSummary {
  let spent = 0;
  let planned = 0;
  for (const s of stops) {
    if (s.status === 'dropped') continue;
    const known = knownCost(s, mine.get(s.id));
    const cost = known ?? (Number(s.price) || 0);
    planned += cost;
    if (isSpent(s, known)) spent += cost;
  }
  spent = round(spent);
  planned = round(planned);
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
