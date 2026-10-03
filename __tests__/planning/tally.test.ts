import type { OptionFit } from '@/features/planning/optionFit';
import { finishedSwiping, likesLabel, rankOptions, tieBreakReason, tiedWithTop } from '@/features/planning/tally';
import type { TripOption, Vote } from '@/features/planning/types';

function option(id: string, cost: number, position: number): TripOption {
  return {
    id,
    trip_id: 't',
    name: id,
    cost_per_person: cost,
    start_date: null,
    end_date: null,
    tags: [],
    summary: null,
    fits_everyone: false,
    plan_json: { days: 3, scene: 'beach', covers: [], avoids: [], halal: true, dayTitles: [] },
    position,
  };
}

function fit(freeCount: number, overBudget = 0): OptionFit {
  return {
    window: { start: '2026-10-12', end: '2026-10-14', days: 3, freeMemberIds: [], freeCount, total: 4 },
    overBudget,
    mustHaves: { covered: 0, total: 0 },
    fitsEveryone: freeCount === 4 && overBudget === 0,
  };
}

const vote = (member: string, opt: string, liked: boolean): Vote => ({ member_id: member, option_id: opt, trip_id: 't', liked });

describe('rankOptions', () => {
  const options = [option('penang', 380, 0), option('langkawi', 450, 1), option('melaka', 260, 2)];
  const fits = new Map([
    ['penang', fit(4)],
    ['langkawi', fit(3)],
    ['melaka', fit(4)],
  ]);

  it('puts the most liked trip first', () => {
    const votes = [vote('a', 'penang', true), vote('r', 'penang', true), vote('a', 'langkawi', true), vote('r', 'melaka', false)];
    const ranked = rankOptions(options, votes, fits);
    expect(ranked.map((r) => r.option.id)).toEqual(['penang', 'langkawi', 'melaka']);
    expect(ranked[0].likerIds).toEqual(['a', 'r']);
  });

  it('breaks ties by who is free, then budget, then price', () => {
    const votes = [vote('a', 'penang', true), vote('a', 'langkawi', true), vote('a', 'melaka', true)];
    const ranked = rankOptions(options, votes, fits);
    // Penang and Melaka: everyone free; Melaka is cheaper. Langkawi: only 3 free.
    expect(ranked.map((r) => r.option.id)).toEqual(['melaka', 'penang', 'langkawi']);
  });
});

describe('ties', () => {
  const options = [option('penang', 380, 0), option('melaka', 390, 1), option('ipoh', 220, 2)];
  const noDates: OptionFit = { ...fit(0), window: null };
  const fits = new Map([
    ['penang', noDates],
    ['melaka', noDates],
    ['ipoh', noDates],
  ]);

  it('finds options with as many likes as the top one, and says why the top one is first', () => {
    const votes = [vote('h', 'penang', true), vote('h', 'melaka', true), vote('h', 'ipoh', false)];
    const ranked = rankOptions(options, votes, fits);
    expect(ranked[0].option.id).toBe('penang');
    expect(tiedWithTop(ranked).map((r) => r.option.id)).toEqual(['melaka']);
    expect(tieBreakReason(ranked[0], ranked[1], true)).toBe("it's the cheapest");
  });

  it('has no tie when one option has the most likes', () => {
    const ranked = rankOptions(options, [vote('h', 'ipoh', true)], fits);
    expect(tiedWithTop(ranked)).toEqual([]);
  });

  it('prefers the option more people are free for', () => {
    const ranked = rankOptions(options, [], new Map([...fits, ['ipoh', fit(2)]]));
    expect(tieBreakReason(ranked[0], ranked[1], false)).toBe('more of you are free for it');
  });
});

describe('finishedSwiping', () => {
  it('lists members who have voted on every option', () => {
    const options = [option('x', 1, 0), option('y', 1, 1)];
    const votes = [vote('a', 'x', true), vote('a', 'y', false), vote('r', 'x', true)];
    expect(finishedSwiping(options, votes, ['a', 'r'])).toEqual(['a']);
  });
});

it('labels likes', () => {
  expect(likesLabel(0)).toBe('0 likes');
  expect(likesLabel(1)).toBe('1 like');
  expect(likesLabel(3)).toBe('3 likes');
});
