import { rangeDates } from '@/features/planning/dates';
import { answered, mustHaveCoverage, optionFit, overBudgetCount } from '@/features/planning/optionFit';
import type { OptionPlan, Preferences } from '@/features/planning/types';

function prefs(id: string, budget: number | null, from: string, to: string, mustHaves: string[] = []): Preferences {
  return {
    member_id: id,
    trip_id: 't',
    daily_budget: budget,
    free_dates: rangeDates(from, to),
    food_needs: [],
    must_haves: mustHaves,
    no_go: null,
    updated_at: '',
  };
}

const plan: OptionPlan = {
  days: 3,
  scene: 'temple',
  covers: ['Beach', 'Street food', 'Nature'],
  avoids: [],
  halal: true,
  dayTitles: [],
};

describe('optionFit', () => {
  const group = [
    prefs('a', 150, '2026-10-11', '2026-10-14', ['Beach', 'Street food', 'Nature']),
    prefs('r', 130, '2026-10-12', '2026-10-15', ['Nightlife']),
  ];

  it('counts members whose budget is too small', () => {
    expect(overBudgetCount(380, 3, group)).toBe(0); // 130 × 3 = 390 covers 380
    expect(overBudgetCount(400, 3, group)).toBe(1);
  });

  it('fits everyone when all are free and within budget', () => {
    const fit = optionFit({ cost_per_person: 380, plan_json: plan }, group, 2);
    expect(fit.window).toMatchObject({ start: '2026-10-12', freeCount: 2 });
    expect(fit.mustHaves).toEqual({ covered: 3, total: 4 });
    expect(fit.fitsEveryone).toBe(true);
  });

  it('is not a fit when someone has not answered', () => {
    const fit = optionFit({ cost_per_person: 300, plan_json: plan }, group, 3);
    expect(fit.fitsEveryone).toBe(false);
  });

  it('collects must-haves across the group', () => {
    expect(mustHaveCoverage(['Beach'], group)).toEqual({ covered: 1, total: 4 });
  });

  it('only counts saved answers', () => {
    expect(answered([...group, prefs('m', null, '2026-10-12', '2026-10-12')])).toHaveLength(2);
  });
});
