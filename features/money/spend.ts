import type { Stop } from '@/features/planning/types';
import { formatMoney } from '@/lib/theme';
import type { NewSpend, Spend, SpendAnswer } from './types';

/**
 * Spend check (prototype screen 9): after leaving a stop whose price is an estimate,
 * each person is asked "About RM 16 spent?" once, and answers for themselves.
 */

type PricedStop = Pick<Stop, 'price' | 'is_estimate' | 'is_booked' | 'category'>;

/** Hotel and flights: booked, already paid, never asked about. */
export const isBookedStop = (s: Pick<Stop, 'is_booked' | 'category'>) =>
  !!s.is_booked || s.category === 'flight' || s.category === 'hotel';

/** Stops worth asking about: an estimated price above RM 0, not booked. */
export function needsSpendCheck(s: PricedStop): boolean {
  return !!s.is_estimate && Number(s.price) > 0 && !isBookedStop(s);
}

/**
 * Answers that count at time t. In Demo mode Reset moves the clock back, and answers given
 * "later" than the fake time are as if they never happened (answering again replaces them).
 */
export function spendsAt(spends: Spend[], t: number): Spend[] {
  return spends.filter((s) => Date.parse(s.answered_at) <= t);
}

/** This person's answers, by stop id. */
export function mySpends(spends: Spend[], memberId: string | null): Map<string, Spend> {
  return new Map(memberId ? spends.filter((s) => s.member_id === memberId).map((s) => [s.stop_id, s]) : []);
}

type CheckStop = Pick<Stop, 'id' | 'status' | 'left_at'> & PricedStop;

/**
 * The stop to ask about now, or null: the stop the group left last today (on its own, or
 * with "We're done here"), if it needs a check and this person hasn't answered for it.
 * Leaving the next stop moves the question on; the one not answered keeps its estimate.
 */
export function spendCheckFor<T extends CheckStop>(dayStops: T[], mine: Map<string, Spend>, now: number): T | null {
  let last: T | null = null;
  for (const s of dayStops) {
    if (s.status !== 'done' || !s.left_at || Date.parse(s.left_at) > now) continue;
    if (!last || Date.parse(s.left_at) > Date.parse(last.left_at!)) last = s;
  }
  return last && needsSpendCheck(last) && !mine.has(last.id) ? last : null;
}

/** What a stop is known to have cost this person: their amount, else one entered on the stop; null = only the estimate. */
export function knownCost(s: Pick<Stop, 'actual_cost'>, mine: Spend | undefined): number | null {
  if (mine && !mine.skipped) return Number(mine.amount) || 0;
  return s.actual_cost != null ? Number(s.actual_cost) || 0 : null;
}

/** The Done row's price: "RM 18" once known, else the plan's "~RM 16" / "RM 15". */
export function doneCostLabel(s: Pick<Stop, 'price' | 'is_estimate' | 'actual_cost'>, mine: Spend | undefined): string {
  const known = knownCost(s, mine);
  return known != null ? formatMoney(known) : formatMoney(Number(s.price) || 0, s.is_estimate);
}

/** What the group has said it spent at a stop: the total of everyone's amounts (skips left out). */
export function groupSpent(spends: Spend[], stopId: string): { total: number; answered: number } {
  const paid = spends.filter((s) => s.stop_id === stopId && !s.skipped);
  return { total: Math.round(paid.reduce((sum, s) => sum + (Number(s.amount) || 0), 0) * 100) / 100, answered: paid.length };
}

/** "Spent so far RM 52 · 3 of 4" under a Done row in a group trip; null when solo or nobody has answered. */
export function spentSoFarLabel(spends: Spend[], stopId: string, groupSize: number): string | null {
  if (groupSize <= 1) return null;
  const { total, answered } = groupSpent(spends, stopId);
  return answered > 0 ? `Spent so far ${formatMoney(total)} · ${answered} of ${groupSize}` : null;
}

/** The amount box: digits and one point, at most 2 decimals and 6 digits before the point. */
export function cleanAmountInput(text: string): string {
  const [whole = '', ...rest] = text.replace(/[^0-9.]/g, '').split('.');
  const w = whole.slice(0, 6);
  return rest.length > 0 ? `${w}.${rest.join('').slice(0, 2)}` : w;
}

/** The typed amount in RM, or null if it isn't a number (0 is fine: it was free after all). */
export function parseAmount(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,6}(\.\d{0,2})?$|^\.\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** The row to save for an answer. */
export function spendRow(
  answer: SpendAnswer,
  stop: Pick<Stop, 'id' | 'trip_id' | 'price'>,
  memberId: string,
  now: Date,
): NewSpend {
  return {
    trip_id: stop.trip_id,
    stop_id: stop.id,
    member_id: memberId,
    amount: answer.kind === 'amount' ? answer.amount : Number(stop.price) || 0,
    confirmed: answer.kind !== 'amount',
    skipped: answer.kind === 'skip',
    answered_at: now.toISOString(),
  };
}
