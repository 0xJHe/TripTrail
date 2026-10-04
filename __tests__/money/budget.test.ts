import { budgetSummary, groupBudget, isSpent } from '@/features/money/budget';
import type { Stop } from '@/features/planning/types';

type S = Pick<Stop, 'price' | 'actual_cost' | 'is_booked' | 'status'>;
const stop = (price: number, extra: Partial<S> = {}): S => ({ price, actual_cost: null, is_booked: false, status: 'planned', ...extra });

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
    stop(89, { is_booked: true }), // flight, already paid
    stop(95, { is_booked: true }), // hotel, already paid
    stop(15, { status: 'done', actual_cost: 31 }), // went, paid more than planned
    stop(0),
    stop(16),
    stop(20),
    stop(50, { status: 'dropped' }), // deleted: not counted
  ];

  it('counts booked and visited stops as spent, and every stop in the plan as planned', () => {
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

  it('treats arrived stops as spent', () => {
    expect(isSpent(stop(10, { status: 'arrived' }))).toBe(true);
    expect(isSpent(stop(10))).toBe(false);
  });
});
