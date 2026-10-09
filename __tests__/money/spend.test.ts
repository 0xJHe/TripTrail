import {
  cleanAmountInput,
  doneCostLabel,
  extraRow,
  groupSpent,
  knownCost,
  myExtras,
  mySpends,
  parseAmount,
  spendCheckFor,
  spendGuess,
  spendQuestion,
  spendRow,
  spendsAt,
  spentSoFarLabel,
} from '@/features/money/spend';
import type { Spend } from '@/features/money/types';
import type { Stop } from '@/features/planning/types';

const t = (h: number, m = 0) => new Date(2026, 9, 12, h, m).getTime();
const iso = (h: number, m = 0) => new Date(t(h, m)).toISOString();

type S = Pick<Stop, 'id' | 'name' | 'status' | 'left_at' | 'price' | 'is_estimate' | 'is_booked' | 'category'>;
const stop = (id: string, extra: Partial<S> = {}): S => ({
  id,
  name: id,
  status: 'planned',
  left_at: null,
  price: 16,
  is_estimate: true,
  is_booked: false,
  category: 'food',
  ...extra,
});
const spend = (stopId: string | null, extra: Partial<Spend> = {}): Spend => ({
  id: `x-${stopId}-${extra.member_id ?? 'me'}`,
  trip_id: 't1',
  stop_id: stopId,
  member_id: 'me',
  day_number: 1,
  amount: 16,
  confirmed: true,
  skipped: false,
  note: null,
  answered_at: iso(16, 15),
  ...extra,
});
const none = new Map<string, Spend>();

describe('the question and its guess', () => {
  it("uses the stop's price, estimate or not, RM 0 too", () => {
    expect(spendQuestion(stop('food'))).toBe('About RM 16 spent?');
    expect(spendQuestion(stop('hill', { price: 30, is_estimate: false }))).toBe('About RM 30 spent?');
    expect(spendQuestion(stop('temple', { price: 0, is_estimate: false }))).toBe('About RM 0 spent?');
    expect(spendGuess(stop('hill', { price: 30, is_estimate: false }))).toBe(30);
  });

  it('asks bookings (hotel, flights) about extras, guess RM 0', () => {
    const hotel = stop('Eastern & Oriental', { price: 95, is_booked: true, category: 'hotel' });
    expect(spendQuestion(hotel)).toBe('Spent anything extra at Eastern & Oriental?');
    expect(spendGuess(hotel)).toBe(0);
    expect(spendGuess(stop('flight', { price: 89, category: 'flight' }))).toBe(0);
  });
});

describe('spendCheckFor (when the prompt shows)', () => {
  const temple = stop('temple', { status: 'done', left_at: iso(13, 0), price: 0, is_estimate: false });
  const food = stop('food', { status: 'done', left_at: iso(16, 10) });
  const market = stop('market');

  it('shows after the group leaves a stop (or taps "We\'re done here")', () => {
    expect(spendCheckFor([temple, food, market], none, t(16, 12))?.id).toBe('food');
  });

  it('shows for RM 0, fixed-price and booked stops too', () => {
    expect(spendCheckFor([temple], none, t(14))?.id).toBe('temple');
    const hill = stop('hill', { status: 'done', left_at: iso(11), price: 30, is_estimate: false });
    expect(spendCheckFor([hill], none, t(11, 5))?.id).toBe('hill');
    const hotel = stop('hotel', { status: 'done', left_at: iso(10), is_booked: true, category: 'hotel', price: 95 });
    expect(spendCheckFor([hotel], none, t(11))?.id).toBe('hotel');
  });

  it('does not show while they are still at the stop, or before it was left (fake clock)', () => {
    expect(spendCheckFor([temple, { ...food, status: 'arrived', left_at: null }, market], none, t(16, 12))?.id).toBe('temple');
    expect(spendCheckFor([food, market], none, t(16, 0))).toBeNull();
  });

  it('asks each person once: gone after this person answers, whatever the others did', () => {
    expect(spendCheckFor([food], mySpends([spend('food')], 'me'), t(16, 20))).toBeNull();
    expect(spendCheckFor([food], mySpends([spend('food', { member_id: 'priya' })], 'me'), t(16, 20))?.id).toBe('food');
  });

  it('a skip counts as an answer', () => {
    expect(spendCheckFor([food], mySpends([spend('food', { skipped: true })], 'me'), t(16, 20))).toBeNull();
  });

  it('only asks about the stop left last: leaving the next one moves the question on', () => {
    const cafe = stop('cafe', { status: 'done', left_at: iso(18) });
    expect(spendCheckFor([food, cafe], none, t(18, 5))?.id).toBe('cafe');
    expect(spendCheckFor([food, cafe], mySpends([spend('cafe')], 'me'), t(18, 5))).toBeNull();
  });

  it("each day's booking stop is its own question (once per day per booking)", () => {
    const hotelDay1 = stop('hotel-d1', { status: 'done', left_at: iso(9), is_booked: true, category: 'hotel', price: 95 });
    const hotelDay2 = stop('hotel-d2', { status: 'done', left_at: iso(9, 30), is_booked: true, category: 'hotel', price: 95 });
    const answered = mySpends([spend('hotel-d1', { amount: 0 })], 'me');
    expect(spendCheckFor([hotelDay1], answered, t(10))).toBeNull();
    expect(spendCheckFor([hotelDay2], answered, t(10))?.id).toBe('hotel-d2');
  });
});

describe('spendsAt (Demo mode Reset)', () => {
  it('ignores stop answers given after the (fake) time, so the prompt comes back', () => {
    const answers = [spend('food', { answered_at: iso(16, 15) })];
    expect(spendsAt(answers, t(16, 20))).toHaveLength(1);
    expect(spendsAt(answers, t(15))).toHaveLength(0);
  });

  it('keeps extra spends whatever the time', () => {
    expect(spendsAt([spend(null, { answered_at: iso(16, 15) })], t(15))).toHaveLength(1);
  });
});

describe('extra spends', () => {
  const all = [
    spend(null, { id: 'e2', amount: 8, note: 'Snacks', answered_at: iso(15) }),
    spend(null, { id: 'e1', amount: 12, note: 'Grab to hotel', answered_at: iso(9) }),
    spend(null, { id: 'e3', member_id: 'priya', amount: 99 }),
    spend('food'),
  ];

  it("are this person's own, oldest first, and kept out of the stop answers", () => {
    expect(myExtras(all, 'me').map((e) => e.id)).toEqual(['e1', 'e2']);
    expect([...mySpends(all, 'me').keys()]).toEqual(['food']);
  });

  it('are saved with their day and an optional note', () => {
    const at = new Date(t(12));
    expect(extraRow('t1', 'me', 2, 12, '  Grab to hotel ', at)).toEqual({
      trip_id: 't1',
      stop_id: null,
      member_id: 'me',
      day_number: 2,
      amount: 12,
      confirmed: false,
      skipped: false,
      note: 'Grab to hotel',
      answered_at: at.toISOString(),
    });
    expect(extraRow('t1', 'me', 1, 5, '   ', at).note).toBeNull();
  });
});

describe('costs and labels', () => {
  const food = { price: 16, is_estimate: true, actual_cost: null, is_booked: false, category: 'food' as const };
  const hotel = { price: 95, is_estimate: false, actual_cost: null, is_booked: true, category: 'hotel' as const };

  it('shows the final cost in Done once answered, else the guess', () => {
    expect(doneCostLabel(food, undefined)).toBe('~RM 16');
    expect(doneCostLabel(food, spend('food', { amount: 18, confirmed: false }))).toBe('RM 18');
    expect(doneCostLabel(food, spend('food'))).toBe('RM 16');
    expect(doneCostLabel(food, spend('food', { skipped: true }))).toBe('~RM 16');
    expect(doneCostLabel({ ...food, price: 0, is_estimate: false }, undefined)).toBe('RM 0');
  });

  it('adds booking extras on top of the booking price', () => {
    expect(knownCost(hotel, undefined)).toBe(95);
    expect(knownCost(hotel, spend('hotel', { amount: 20 }))).toBe(115);
    expect(doneCostLabel(hotel, spend('hotel', { amount: 20 }))).toBe('RM 115');
    expect(doneCostLabel(hotel, spend('hotel', { amount: 20, skipped: true }))).toBe('RM 95');
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
    expect(spentSoFarLabel(all, 'food', 4, true)).toBe('Extras so far RM 34 · 2 of 4');
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
  const s = { id: 'food', trip_id: 't1', day_number: 2, price: 16, is_booked: false, category: 'food' as const };
  const at = new Date(t(16, 15));

  it('✓ saves the guess as confirmed, on the stop\'s day', () => {
    expect(spendRow({ kind: 'confirm' }, s, 'me', at)).toEqual({
      trip_id: 't1',
      stop_id: 'food',
      member_id: 'me',
      day_number: 2,
      amount: 16,
      confirmed: true,
      skipped: false,
      note: null,
      answered_at: at.toISOString(),
    });
  });

  it('an amount typed in is saved as entered, and a skip keeps the guess', () => {
    expect(spendRow({ kind: 'amount', amount: 18 }, s, 'me', at)).toMatchObject({ amount: 18, confirmed: false, skipped: false });
    expect(spendRow({ kind: 'skip' }, s, 'me', at)).toMatchObject({ amount: 16, skipped: true });
  });

  it('✓ on a booking saves RM 0 extra', () => {
    expect(spendRow({ kind: 'confirm' }, { ...s, price: 95, is_booked: true, category: 'hotel' }, 'me', at)).toMatchObject({ amount: 0 });
  });
});
