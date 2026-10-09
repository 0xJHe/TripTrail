import {
  cleanAmountInput,
  doneCostLabel,
  groupSpent,
  mySpends,
  needsSpendCheck,
  parseAmount,
  spendCheckFor,
  spendRow,
  spendsAt,
  spentSoFarLabel,
} from '@/features/money/spend';
import type { Spend } from '@/features/money/types';
import type { Stop } from '@/features/planning/types';

const t = (h: number, m = 0) => new Date(2026, 9, 12, h, m).getTime();
const iso = (h: number, m = 0) => new Date(t(h, m)).toISOString();

type S = Pick<Stop, 'id' | 'status' | 'left_at' | 'price' | 'is_estimate' | 'is_booked' | 'category'>;
const stop = (id: string, extra: Partial<S> = {}): S => ({
  id,
  status: 'planned',
  left_at: null,
  price: 16,
  is_estimate: true,
  is_booked: false,
  category: 'food',
  ...extra,
});
const spend = (stopId: string, extra: Partial<Spend> = {}): Spend => ({
  id: `x-${stopId}-${extra.member_id ?? 'me'}`,
  trip_id: 't1',
  stop_id: stopId,
  member_id: 'me',
  amount: 16,
  confirmed: true,
  skipped: false,
  answered_at: iso(16, 15),
  ...extra,
});
const none = new Map<string, Spend>();

describe('needsSpendCheck', () => {
  it('asks about stops with an estimated price', () => {
    expect(needsSpendCheck(stop('a'))).toBe(true);
  });

  it('never asks about RM 0, fixed prices, or booked stops (hotel, flights)', () => {
    expect(needsSpendCheck(stop('a', { price: 0 }))).toBe(false);
    expect(needsSpendCheck(stop('a', { is_estimate: false }))).toBe(false);
    expect(needsSpendCheck(stop('a', { is_booked: true }))).toBe(false);
    expect(needsSpendCheck(stop('a', { category: 'hotel' }))).toBe(false);
    expect(needsSpendCheck(stop('a', { category: 'flight' }))).toBe(false);
  });
});

describe('spendCheckFor (when the prompt shows)', () => {
  const temple = stop('temple', { status: 'done', left_at: iso(13, 0), price: 0 });
  const food = stop('food', { status: 'done', left_at: iso(16, 10) });
  const market = stop('market');

  it("shows after the group leaves a stop with an estimated price (or taps \"We're done here\")", () => {
    expect(spendCheckFor([temple, food, market], none, t(16, 12))?.id).toBe('food');
  });

  it('does not show while they are still at the stop, or before it was left (fake clock)', () => {
    expect(spendCheckFor([temple, { ...food, status: 'arrived', left_at: null }, market], none, t(16, 12))).toBeNull();
    expect(spendCheckFor([temple, food, market], none, t(16, 0))).toBeNull();
  });

  it('does not show for RM 0 or booked stops', () => {
    expect(spendCheckFor([temple], none, t(14))).toBeNull();
    const hotel = stop('hotel', { status: 'done', left_at: iso(10), is_booked: true, category: 'hotel', price: 95 });
    expect(spendCheckFor([hotel], none, t(11))).toBeNull();
  });

  it('asks each person once: gone after this person answers, whatever the others did', () => {
    expect(spendCheckFor([food], mySpends([spend('food')], 'me'), t(16, 20))).toBeNull();
    expect(spendCheckFor([food], mySpends([spend('food', { member_id: 'priya' })], 'me'), t(16, 20))?.id).toBe('food');
  });

  it('a skip counts as an answer', () => {
    expect(spendCheckFor([food], mySpends([spend('food', { skipped: true })], 'me'), t(16, 20))).toBeNull();
  });

  it('only asks about the stop left last: leaving the next one moves the question on', () => {
    const later = stop('later', { status: 'done', left_at: iso(18), is_estimate: false });
    expect(spendCheckFor([food, later], none, t(18, 5))).toBeNull();
    const cafe = stop('cafe', { status: 'done', left_at: iso(18) });
    expect(spendCheckFor([food, cafe], none, t(18, 5))?.id).toBe('cafe');
  });
});

describe('spendsAt (Demo mode Reset)', () => {
  it('ignores answers given after the (fake) time, so the prompt comes back', () => {
    const answers = [spend('food', { answered_at: iso(16, 15) })];
    expect(spendsAt(answers, t(16, 20))).toHaveLength(1);
    expect(spendsAt(answers, t(15))).toHaveLength(0);
  });
});

describe('labels', () => {
  const food = { price: 16, is_estimate: true, actual_cost: null };

  it('shows the final cost in Done once answered, else the estimate', () => {
    expect(doneCostLabel(food, undefined)).toBe('~RM 16');
    expect(doneCostLabel(food, spend('food', { amount: 18, confirmed: false }))).toBe('RM 18');
    expect(doneCostLabel(food, spend('food'))).toBe('RM 16');
    expect(doneCostLabel(food, spend('food', { skipped: true }))).toBe('~RM 16');
    expect(doneCostLabel({ price: 0, is_estimate: false, actual_cost: null }, undefined)).toBe('RM 0');
  });

  it('adds up what the group has said it spent, leaving out skips', () => {
    const all = [
      spend('food', { member_id: 'me', amount: 18 }),
      spend('food', { member_id: 'priya', amount: 16 }),
      spend('food', { member_id: 'ben', skipped: true }),
      spend('other', { member_id: 'me', amount: 99 }),
    ];
    expect(groupSpent(all, 'food')).toEqual({ total: 34, answered: 2 });
    expect(spentSoFarLabel(all, 'food', 4)).toBe('Spent so far RM 34 · 2 of 4');
    expect(spentSoFarLabel(all, 'market', 4)).toBeNull();
    expect(spentSoFarLabel(all, 'food', 1)).toBeNull();
  });
});

describe('amount input', () => {
  it('keeps numbers only, one point and two decimals', () => {
    expect(cleanAmountInput('RM 18')).toBe('18');
    expect(cleanAmountInput('18.505')).toBe('18.50');
    expect(cleanAmountInput('1.2.3')).toBe('1.23');
    expect(cleanAmountInput('abc')).toBe('');
  });

  it('parses RM amounts and rejects anything else', () => {
    expect(parseAmount('18')).toBe(18);
    expect(parseAmount('18.5')).toBe(18.5);
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('.')).toBeNull();
    expect(parseAmount('-3')).toBeNull();
    expect(parseAmount('12abc')).toBeNull();
  });
});

describe('spendRow', () => {
  const s = { id: 'food', trip_id: 't1', price: 16 };
  const at = new Date(t(16, 15));

  it('✓ saves the estimate as confirmed', () => {
    expect(spendRow({ kind: 'confirm' }, s, 'me', at)).toEqual({
      trip_id: 't1',
      stop_id: 'food',
      member_id: 'me',
      amount: 16,
      confirmed: true,
      skipped: false,
      answered_at: at.toISOString(),
    });
  });

  it('an amount typed in is saved as entered, and a skip keeps the estimate', () => {
    expect(spendRow({ kind: 'amount', amount: 18 }, s, 'me', at)).toMatchObject({ amount: 18, confirmed: false, skipped: false });
    expect(spendRow({ kind: 'skip' }, s, 'me', at)).toMatchObject({ amount: 16, skipped: true });
  });
});
