import type { Stop } from '@/features/planning/types';
import { formatMoney } from '@/lib/theme';
import type { NewSpend, Spend, SpendAnswer } from './types';

/**
 * Spend check (prototype screen 9): after the group leaves any stop, each person is asked
 * once, for themselves: "About RM 16 spent?" with the stop's price as the guess. For a
 * booked stop (hotel, flights), already paid: "Spent anything extra at Hotel?", guess RM 0,
 * once per day per booking; extras go on top of the booking price.
 */

type PricedStop = Pick<Stop, 'price' | 'is_booked' | 'category'>;

/** Hotel and flights: booked and already paid. */
export const isBookedStop = (s: Pick<Stop, 'is_booked' | 'category'>) =>
  !!s.is_booked || s.category === 'flight' || s.category === 'hotel';

/** The amount the spend check suggests: the stop's price, or RM 0 extra for a booking. */
export const spendGuess = (s: PricedStop) => (isBookedStop(s) ? 0 : Number(s.price) || 0);

/** The card's question: "About RM 16 spent?", "About RM 0 spent?", "Spent anything extra at Hotel?". */
export function spendQuestion(s: PricedStop & Pick<Stop, 'name'>): string {
  return isBookedStop(s) ? `Spent anything extra at ${s.name}?` : `About ${formatMoney(spendGuess(s))} spent?`;
}

/**
 * Stop answers that count at time t. In Demo mode Reset moves the clock back, and answers
 * given "later" than the fake time are as if they never happened (answering again replaces
 * them). Extra spends always count: they're logged by hand, not by the replay.
 */
export function spendsAt(spends: Spend[], t: number): Spend[] {
  return spends.filter((s) => s.stop_id == null || Date.parse(s.answered_at) <= t);
}

/** This person's spend-check answers, by stop id (extra spends left out). */
export function mySpends(spends: Spend[], memberId: string | null): Map<string, Spend> {
  if (!memberId) return new Map();
  return new Map(spends.filter((s) => s.member_id === memberId && s.stop_id != null).map((s) => [s.stop_id!, s]));
}

/** This person's extra spends ("+ Add spend"), oldest first. */
export function myExtras(spends: Spend[], memberId: string | null): Spend[] {
  return spends
    .filter((s) => s.stop_id == null && s.member_id === memberId)
    .sort((a, b) => a.answered_at.localeCompare(b.answered_at));
}

type CheckStop = Pick<Stop, 'id' | 'status' | 'left_at'>;

/**
 * The stop to ask about now, or null: the stop the group left last today (on its own, or
 * with "We're done here"), if this person hasn't answered for it. Every stop is asked about,
 * RM 0 and fixed prices too. Leaving the next stop moves the question on; the one not
 * answered keeps its guess.
 */
export function spendCheckFor<T extends CheckStop>(dayStops: T[], mine: Map<string, Spend>, now: number): T | null {
  let last: T | null = null;
  for (const s of dayStops) {
    if (s.status !== 'done' || !s.left_at || Date.parse(s.left_at) > now) continue;
    if (!last || Date.parse(s.left_at) > Date.parse(last.left_at!)) last = s;
  }
  return last && !mine.has(last.id) ? last : null;
}

/** An answer's amount, or null if there's none or it was skipped. */
const answered = (mine: Spend | undefined) => (mine && !mine.skipped ? Number(mine.amount) || 0 : null);

type CostStop = Pick<Stop, 'price' | 'actual_cost' | 'is_booked' | 'category'>;

/**
 * What a stop is known to have cost this person, or null when only the guess is known.
 * A booking: its price plus any extra they gave. Otherwise their amount, else one entered on the stop.
 */
export function knownCost(s: CostStop, mine: Spend | undefined): number | null {
  if (isBookedStop(s)) return (Number(s.price) || 0) + (answered(mine) ?? 0);
  const amount = answered(mine);
  if (amount != null) return amount;
  return s.actual_cost != null ? Number(s.actual_cost) || 0 : null;
}

/** The Done row's price: "RM 18" once known, else the plan's "~RM 16" / "RM 15". */
export function doneCostLabel(s: CostStop & Pick<Stop, 'is_estimate'>, mine: Spend | undefined): string {
  const known = knownCost(s, mine);
  return known != null ? formatMoney(known) : formatMoney(Number(s.price) || 0, s.is_estimate);
}

/** What the group has said it spent at a stop: the total of everyone's amounts (skips left out). */
export function groupSpent(spends: Spend[], stopId: string): { total: number; answered: number } {
  const paid = spends.filter((s) => s.stop_id === stopId && !s.skipped);
  return { total: Math.round(paid.reduce((sum, s) => sum + (Number(s.amount) || 0), 0) * 100) / 100, answered: paid.length };
}

/** "Spent so far RM 52 · 3 of 4" under a Done row in a group trip; null when solo or nobody has answered. */
export function spentSoFarLabel(spends: Spend[], stopId: string, groupSize: number, booked = false): string | null {
  if (groupSize <= 1) return null;
  const { total, answered: n } = groupSpent(spends, stopId);
  if (n === 0) return null;
  return `${booked ? 'Extras so far' : 'Spent so far'} ${formatMoney(total)} · ${n} of ${groupSize}`;
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

/** The row to save for a spend-check answer. */
export function spendRow(
  answer: SpendAnswer,
  stop: Pick<Stop, 'id' | 'trip_id' | 'day_number'> & PricedStop,
  memberId: string,
  now: Date,
): NewSpend {
  return {
    trip_id: stop.trip_id,
    stop_id: stop.id,
    member_id: memberId,
    day_number: stop.day_number,
    amount: answer.kind === 'amount' ? answer.amount : spendGuess(stop),
    confirmed: answer.kind !== 'amount',
    skipped: answer.kind === 'skip',
    note: null,
    answered_at: now.toISOString(),
  };
}

/** The row to save for an extra spend logged with "+ Add spend". */
export function extraRow(tripId: string, memberId: string, day: number, amount: number, note: string, now: Date): NewSpend {
  return {
    trip_id: tripId,
    stop_id: null,
    member_id: memberId,
    day_number: day,
    amount,
    confirmed: false,
    skipped: false,
    note: note.trim().slice(0, 80) || null,
    answered_at: now.toISOString(),
  };
}
