// generate-trip-options logic with fake Gemini and Google answers. No real API calls.
import {
  fitNote,
  groupLimits,
  longestSharedRun,
  mostFreeFor,
  optionProblems,
  planTripOptions,
  sampleTripOptions,
  type OptionsDeps,
  type TripOptionsRequest,
} from '@/supabase/functions/_shared/tripOptions';

const oct = (...days: number[]) => days.map((d) => `2026-10-${String(d).padStart(2, '0')}`);

const req: TripOptionsRequest = {
  destination: null,
  lengthMin: 2,
  lengthMax: 3,
  members: [
    { dailyBudget: 150, foodNeeds: ['Halal'], mustHaves: ['Beach'], noGo: 'Early mornings' },
    { dailyBudget: 200, foodNeeds: [], mustHaves: ['Street food'], noGo: null },
  ],
  freeDates: [oct(10, 11, 12, 13, 14), oct(11, 12, 13, 20)],
  totalMembers: 2,
};

const option = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  days: 3,
  costPerPerson: 400,
  tags: ['Beach', 'Food', 'Temples'],
  covers: ['Beach', 'Street food'],
  avoids: [],
  halal: true,
  scene: 'beach',
  dayTitles: ['A', 'B', 'C'],
  landmark: `${name} landmark`,
  ...extra,
});

const answer = (...options: object[]) => JSON.stringify({ options });
const fitting = answer(option('Penang'), option('Langkawi'), option('Ipoh', { costPerPerson: 300 }), option('Melaka'));

function fakes(answers: string[], withPhotos = true) {
  const prompts: string[] = [];
  const photoLookups: string[] = [];
  const deps: OptionsDeps = {
    ask: async (prompt) => {
      prompts.push(prompt);
      const next = answers.shift();
      if (next === undefined) throw new Error('Gemini 503');
      return next;
    },
    findPhoto: withPhotos
      ? async (landmark) => {
          photoLookups.push(landmark);
          return { value: { url: `https://photo/${landmark}`, credit: 'Ana Lim', creditUrl: null }, limited: false, calls: 2 };
        }
      : null,
  };
  return { deps, prompts, photoLookups };
}

describe('group limits', () => {
  it('finds the longest run of days everyone is free', () => {
    expect(longestSharedRun(req.freeDates!)).toBe(3); // 11–13 Oct
    expect(longestSharedRun([oct(1, 3, 5), oct(1, 3, 5)])).toBe(1);
    expect(mostFreeFor([oct(1, 2), oct(5, 6), oct(5, 6)], 2)).toBe(2);
  });

  it('uses the lowest budget, halal and every no-go', () => {
    expect(groupLimits(req)).toEqual({ dailyBudget: 150, halal: true, noGos: ['Early mornings'], answered: 2, sharedRun: 3, bestFree: 2 });
  });

  it('lists what an option does not fit', () => {
    const limits = groupLimits(req);
    const bad = { ...option('Bangkok', { costPerPerson: 610, halal: false, avoids: ['Early mornings'] }), scene: 'city' as const };
    expect(optionProblems(bad, limits)).toEqual([
      '"Bangkok" costs RM 610 but must be at most RM 450 (RM 150 a day × 3 days)',
      '"Bangkok" has no easy halal food',
      '"Bangkok" involves a no-go: Early mornings',
    ]);
    expect(optionProblems({ ...option('Penang'), scene: 'temple' }, limits)).toEqual([]);
  });
});

describe('planTripOptions', () => {
  it('returns options that fit everyone, each with one photo, and no note', async () => {
    const f = fakes([fitting]);
    const result = await planTripOptions(req, f.deps);
    expect(result.source).toBe('ai');
    expect(result.note).toBeNull();
    expect(f.prompts).toHaveLength(1);
    expect(result.options[0].photo).toEqual({ url: 'https://photo/Penang landmark', credit: 'Ana Lim', creditUrl: null });
    expect(f.photoLookups).toEqual(['Penang landmark', 'Langkawi landmark', 'Ipoh landmark', 'Melaka landmark']);
    expect(result.googleCalls).toBe(8);
  });

  it('tells Gemini the hard limits', async () => {
    const f = fakes([fitting]);
    await planTripOptions(req, f.deps);
    expect(f.prompts[0]).toContain('at most RM 150 × days');
    expect(f.prompts[0]).toContain('"avoids" must not contain these');
    expect(f.prompts[0]).toContain('only places with easy halal food');
    expect(f.prompts[0]).toContain('2026-10-11, 2026-10-12, 2026-10-13');
    expect(f.prompts[0]).toContain('"landmark"');
  });

  it('retries once with the problems and keeps the answer that fits', async () => {
    const tooDear = answer(option('Penang', { costPerPerson: 900 }), option('Langkawi'), option('Ipoh'), option('Melaka'));
    const f = fakes([tooDear, fitting]);
    const result = await planTripOptions(req, f.deps);
    expect(f.prompts).toHaveLength(2);
    expect(f.prompts[1]).toContain('"Penang" costs RM 900 but must be at most RM 450');
    expect(result.options.find((o) => o.name === 'Penang')?.costPerPerson).toBe(400);
    expect(result.note).toBeNull();
  });

  it('when it is impossible, returns the closest options (fitting ones first) with a short reason', async () => {
    const noShared: TripOptionsRequest = { ...req, freeDates: [oct(1, 2, 3), oct(2, 3, 4), oct(10, 11)], members: [...req.members, req.members[1]] };
    const twoDays = answer(...['Penang', 'Langkawi', 'Ipoh', 'Melaka'].map((n) => option(n, { days: 2, costPerPerson: 260, dayTitles: ['A', 'B'] })));
    const result = await planTripOptions(noShared, fakes([twoDays, twoDays]).deps);
    expect(result.note).toBe('No dates suit all 3, these suit 2 of 3');
  });

  it('explains when no trip fits the lowest budget', async () => {
    const allDear = answer(...['Penang', 'Langkawi', 'Ipoh', 'Melaka'].map((n) => option(n, { costPerPerson: 900 })));
    const result = await planTripOptions(req, fakes([allDear, allDear]).deps);
    expect(result.source).toBe('ai');
    expect(result.note).toBe('No trip fits the lowest budget (RM 150 a day), these are the closest');
  });

  it('falls back to the sample options after two broken answers, still with photos', async () => {
    const f = fakes(['not json', '{"options": []}']);
    const result = await planTripOptions(req, f.deps);
    expect(result.source).toBe('sample');
    expect(result.reason).toBe('Give at least 4 options.');
    expect(result.options.map((o) => o.name).sort()).toEqual(sampleTripOptions(req).map((o) => o.name).sort());
    expect(result.options.every((o) => o.photo?.url)).toBe(true);
  });

  it("keeps the drawing and marks it when Google's limit is reached", async () => {
    const f = fakes([fitting]);
    f.deps.findPhoto = async () => ({ value: null, limited: true, calls: 0 });
    const result = await planTripOptions(req, f.deps);
    expect(result.options[0]).toMatchObject({ photo: null, photoLimited: true });
  });

  it('works with no Gemini and no Google', async () => {
    const result = await planTripOptions(req, { ask: null, findPhoto: null });
    expect(result.source).toBe('sample');
    expect(result.googleCalls).toBe(0);
  });
});

describe('fitNote', () => {
  it('is null when every option fits', () => {
    const limits = groupLimits(req);
    expect(fitNote([{ ...option('Penang'), scene: 'temple' }], limits, req)).toBeNull();
  });

  it('speaks to a solo traveller', () => {
    const solo: TripOptionsRequest = { ...req, members: [req.members[0]], freeDates: [oct(1, 3, 5)] };
    const limits = groupLimits(solo);
    expect(fitNote([{ ...option('Penang'), scene: 'temple' }], limits, solo)).toBe("Your free dates don't have 2 days in a row");
  });
});
