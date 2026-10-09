import { budgetSummary, groupBudget, isSpent } from '@/features/money/budget';
import type { Spend } from '@/features/money/types';
import type { Stop } from '@/features/planning/types';

type S = Pick<Stop, 'id' | 'price' | 'actual_cost' | 'is_booked' | 'is_estimate' | 'category' | 'status'>;
let n = 0;
const stop = (price: number, extra: Partial<S> = {}): S => ({
  id: `s${++n}`,
  price,
  actual_cost: null,
  is_booked: false,
  is_estimate: false,
  category: null,
  status: 'planned',
  ...extra,
});
const answer = (s: S, amount: number, extra: Partial<Spend> = {}): Spend => ({
  id: `a-${s.id}`,
  trip_id: 't1',
  stop_id: s.id,
  member_id: 'me',
  day_number: 1,
  amount,
  confirmed: true,
  skipped: false,
  note: null,
  answered_at: '2026-10-12T08:00:00.000Z',
  ...extra,
});
const mine = (...spends: Spend[]) => new Map(spends.map((s) => [s.stop_id!, s]));

describe('groupBudget', () => {
  it('uses the lowest daily budget times the days, so it fits everyone', () => {
    expect(groupBudget([{ daily_budget: 150 }, { daily_budget: 200 }, { daily_budget: 180 }], 3)).toBe(450);
  });

  it('ignores members with no budget, and is null when nobody gave one', () => {
    expect(groupBudget([{ daily_budget: null }, { daily_budget: 100 }], 2)).toBe(200);
    expect(groupBudget([{ daily_budget: null }], 3)).toBeNull();
    expect(groupBudget([], 3)).toBeNull();
  });
});

describe('budgetSummary', () => {
  const plan = [
    stop(89, { is_booked: true, category: 'flight' }), // flight, already paid
    stop(95, { is_booked: true, category: 'hotel' }), // hotel, already paid
    stop(15, { status: 'done', actual_cost: 31 }), // went, paid more than planned
    stop(0),
    stop(16, { is_estimate: true }),
    stop(20, { is_estimate: true }),
    stop(50, { status: 'dropped' }), // deleted: not counted
  ];

  it('counts booked and visited fixed-price stops as spent, and every stop in the plan as planned', () => {
    const s = budgetSummary(plan, 450);
    expect(s.spent).toBe(89 + 95 + 31);
    expect(s.planned).toBe(89 + 95 + 31 + 0 + 16 + 20);
    expect(s.budget).toBe(450);
    expect(s.over).toBe(0);
  });

  it('fills the bar against the budget', () => {
    const s = budgetSummary(plan, 450);
    expect(s.spentFill).toBeCloseTo(215 / 450);
    expect(s.plannedFill).toBeCloseTo(251 / 450);
  });

  it('says how far over budget the plan is and fills against the plan instead', () => {
    const s = budgetSummary([stop(300, { is_booked: true }), stop(200)], 400);
    expect(s.over).toBe(100);
    expect(s.plannedFill).toBe(1);
    expect(s.spentFill).toBeCloseTo(300 / 500);
  });

  it('works with no budget and no stops', () => {
    expect(budgetSummary([], null)).toEqual({ spent: 0, planned: 0, budget: null, spentFill: 0, plannedFill: 0, over: 0 });
  });

  it('treats arrived fixed-price stops as spent', () => {
    expect(isSpent(stop(10, { status: 'arrived' }))).toBe(true);
    expect(isSpent(stop(10))).toBe(false);
  });
});

describe('budgetSummary with spend-check answers', () => {
  const booked = stop(95, { is_booked: true, category: 'hotel' });
  const funicular = stop(15, { status: 'done' }); // fixed price, nothing to check
  const food = stop(16, { status: 'done', is_estimate: true });
  const market = stop(20, { is_estimate: true });

  it('leaves a visited estimate stop out of spent until it is answered, but keeps it planned', () => {
    const s = budgetSummary([booked, funicular, food, market], null);
    expect(s.spent).toBe(95 + 15);
    expect(s.planned).toBe(95 + 15 + 16 + 20);
  });

  it('a ✓ counts the estimate as spent', () => {
    const s = budgetSummary([booked, funicular, food, market], null, mine(answer(food, 16)));
    expect(s.spent).toBe(95 + 15 + 16);
    expect(s.planned).toBe(95 + 15 + 16 + 20);
  });

  it('an amount typed in replaces the estimate in both spent and planned', () => {
    const s = budgetSummary([booked, funicular, food, market], null, mine(answer(food, 18, { confirmed: false })));
    expect(s.spent).toBe(95 + 15 + 18);
    expect(s.planned).toBe(95 + 15 + 18 + 20);
  });

  it('a skipped stop keeps its estimate in the plan and is not counted as spent', () => {
    const s = budgetSummary([booked, food, market], null, mine(answer(food, 16, { skipped: true })));
    expect(s.spent).toBe(95);
    expect(s.planned).toBe(95 + 16 + 20);
  });

  it('keeps cents and ignores answers for dropped stops', () => {
    const dropped = stop(30, { status: 'dropped', is_estimate: true });
    const s = budgetSummary([food, dropped], null, mine(answer(food, 17.5, { confirmed: false }), answer(dropped, 40)));
    expect(s.spent).toBe(17.5);
    expect(s.planned).toBe(17.5);
  });

  it('a booked stop is spent at its price even if marked as an estimate', () => {
    expect(isSpent(stop(89, { is_booked: true, is_estimate: true }))).toBe(true);
  });

  it('a visited fixed-price stop not answered yet counts its price as spent; an answer replaces it', () => {
    expect(budgetSummary([funicular], null).spent).toBe(15);
    const s = budgetSummary([funicular], null, mine(answer(funicular, 30, { confirmed: false })));
    expect(s.spent).toBe(30);
    expect(s.planned).toBe(30);
  });

  it('an RM 0 stop answered with an amount counts it', () => {
    const temple = stop(0, { status: 'done', is_estimate: false });
    expect(budgetSummary([temple], null, mine(answer(temple, 5, { confirmed: false }))).spent).toBe(5);
  });

  it('booking extras go on top of the booking price, which stays spent', () => {
    const hotel = stop(95, { is_booked: true, category: 'hotel', status: 'done' });
    expect(budgetSummary([hotel], null, mine(answer(hotel, 0))).spent).toBe(95);
    const s = budgetSummary([hotel], null, mine(answer(hotel, 20, { confirmed: false })));
    expect(s.spent).toBe(115);
    expect(s.planned).toBe(115);
    expect(budgetSummary([hotel], null, mine(answer(hotel, 0, { skipped: true }))).spent).toBe(95);
  });

  it('extra spends ("+ Add spend") count as spent and planned', () => {
    const s = budgetSummary([booked, market], 300, new Map(), [{ amount: 12 }, { amount: 8.5 }]);
    expect(s.spent).toBe(95 + 12 + 8.5);
    expect(s.planned).toBe(95 + 20 + 12 + 8.5);
    expect(s.spentFill).toBeCloseTo(115.5 / 300);
  });
});
