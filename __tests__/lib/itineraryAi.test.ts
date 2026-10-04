// generate-itinerary logic with fake Gemini and Google answers. No real API calls.
import {
  checkItinerary,
  fitToBudget,
  GOOGLE_LIMIT_NOTE,
  planItinerary,
  planTotal,
  sampleItinerary,
  type ItineraryInput,
  type PlannerDeps,
} from '@/supabase/functions/_shared/itinerary';

const input: ItineraryInput = {
  destination: 'Penang',
  days: 2,
  dayTitles: ['George Town', 'Beach'],
  halal: true,
  startDate: '2026-10-12',
  members: [
    { dailyBudget: 150, foodNeeds: ['Halal'], mustHaves: ['Street food'], noGo: 'Early mornings' },
    { dailyBudget: 200, foodNeeds: [], mustHaves: ['Beach'], noGo: null },
  ],
  budget: 300,
};

const stop = (name: string, start: string, end: string, price: number, extra: Record<string, unknown> = {}) => ({
  name,
  search: `${name}, Penang`,
  start,
  end,
  price,
  estimate: false,
  outdoor: true,
  category: 'sight',
  halal: false,
  tip: 'Go early.',
  lat: 5.41,
  lng: 100.33,
  ...extra,
});

function day(n: number, extraPrice = 0) {
  return {
    day: n,
    stops: [
      stop(`Sight ${n}A`, '09:00', '10:30', 10 + extraPrice),
      stop(`Lunch ${n}`, '12:30', '13:30', 15, { category: 'food', halal: true, estimate: true, outdoor: false }),
      stop(`Sight ${n}B`, '15:00', '16:30', 20 + extraPrice),
      stop(`Dinner ${n}`, '19:00', '20:30', 20, { category: 'food', halal: true, estimate: true }),
    ],
  };
}

const goodPlan = JSON.stringify({ days: [day(1), day(2)] });

function fakes(answers: string[], places: PlannerDeps['findPlace'] = null) {
  const prompts: string[] = [];
  const deps: PlannerDeps = {
    ask: async (prompt) => {
      prompts.push(prompt);
      const next = answers.shift();
      if (next === undefined) throw new Error('Gemini 503');
      return next;
    },
    findPlace: places,
  };
  return { deps, prompts };
}

describe('checkItinerary', () => {
  it('turns a good answer into stops with times, prices and tips', () => {
    const stops = checkItinerary(goodPlan, input);
    expect(stops).toHaveLength(8);
    expect(stops[0]).toMatchObject({ day: 1, time: '09:00', endTime: '10:30', name: 'Sight 1A', price: 10, isEstimate: false, isOutdoor: true, tip: 'Go early.' });
    expect(stops[1]).toMatchObject({ category: 'food', isEstimate: true, isOutdoor: false });
  });

  it('rejects broken answers with a reason Gemini can fix', () => {
    expect(() => checkItinerary('not json', input)).toThrow('not valid JSON');
    expect(() => checkItinerary(JSON.stringify({ days: [day(1)] }), input)).toThrow('Day 2 is missing');
    const backwards = { days: [{ day: 1, stops: [stop('A', '10:00', '09:00', 1), stop('B', '11:00', '12:00', 1), stop('C', '13:00', '14:00', 1)] }, day(2)] };
    expect(() => checkItinerary(JSON.stringify(backwards), input)).toThrow('"A" ends before it starts');
  });

  it('insists every food stop is halal when someone needs halal', () => {
    const notHalal = day(1);
    notHalal.stops[1] = stop('Pork noodles', '12:30', '13:30', 12, { category: 'food', halal: false });
    expect(() => checkItinerary(JSON.stringify({ days: [notHalal, day(2)] }), input)).toThrow('not halal');
    expect(checkItinerary(JSON.stringify({ days: [notHalal, day(2)] }), { ...input, halal: false })).toHaveLength(8);
  });

  it('rejects a plan over the group budget', () => {
    expect(() => checkItinerary(JSON.stringify({ days: [day(1, 100), day(2, 100)] }), input)).toThrow('budget is RM 300');
  });
});

describe('fitToBudget', () => {
  it('drops the most expensive sights first, keeping meals and at least 3 stops a day', () => {
    let over: ReturnType<typeof checkItinerary> = [];
    try {
      checkItinerary(JSON.stringify({ days: [day(1, 100), day(2, 100)] }), input);
    } catch (e) {
      over = (e as { stops: typeof over }).stops;
    }
    const fitted = fitToBudget(over, 300);
    expect(planTotal(fitted)).toBeLessThanOrEqual(300);
    expect(fitted.filter((s) => s.category === 'food')).toHaveLength(4);
    expect(fitted.filter((s) => s.day === 1).length).toBeGreaterThanOrEqual(3);
  });
});

describe('planItinerary', () => {
  const found = (lat = 5.42, lng = 100.34) => async (query: string) => ({
    value: { placeId: `pid:${query}`, address: `${query} (real address)`, lat, lng },
    limited: false,
    calls: 1,
  });

  it('uses Gemini and adds real addresses, locations and place IDs', async () => {
    const f = fakes([goodPlan], found());
    const result = await planItinerary(input, f.deps);
    expect(result.source).toBe('ai');
    expect(result.note).toBeNull();
    expect(result.googleCalls).toBe(8);
    expect(result.stops[0]).toMatchObject({ placeId: 'pid:Sight 1A, Penang', address: 'Sight 1A, Penang (real address)', lat: 5.42 });
    expect(f.prompts[0]).toContain('EVERY food stop must be a halal');
    expect(f.prompts[0]).toContain('at most RM 300');
    expect(f.prompts[0]).toContain('Monday 2026-10-12');
    expect(f.prompts[0]).toContain('no-go: Early mornings');
  });

  it('retries once with the problem, then uses the fixed answer', async () => {
    const f = fakes(['{"oops":', goodPlan]);
    const result = await planItinerary(input, f.deps);
    expect(result.source).toBe('ai');
    expect(f.prompts).toHaveLength(2);
    expect(f.prompts[1]).toContain('Your last answer had a problem: The answer was not valid JSON.');
  });

  it('falls back to the sample plan after two bad answers', async () => {
    const f = fakes(['nope', '{"days": []}']);
    const result = await planItinerary(input, f.deps);
    expect(result.source).toBe('sample');
    expect(result.stops.map((s) => s.name)).toEqual(sampleItinerary(input).map((s) => s.name));
  });

  it('makes a plan that is still over budget after the retry fit', async () => {
    const expensive = JSON.stringify({ days: [day(1, 100), day(2, 100)] });
    const result = await planItinerary(input, fakes([expensive, expensive]).deps);
    expect(result.source).toBe('ai');
    expect(planTotal(result.stops)).toBeLessThanOrEqual(300);
  });

  it("keeps Gemini's own location and shows a note when Google's limit is reached", async () => {
    const limited = async () => ({ value: null, limited: true, calls: 0 });
    const result = await planItinerary(input, fakes([goodPlan], limited).deps);
    expect(result.note).toBe(GOOGLE_LIMIT_NOTE);
    expect(result.stops[0]).toMatchObject({ lat: 5.41, lng: 100.33, address: null, placeId: null });
  });

  it("ignores a Google result far away from Gemini's location", async () => {
    const result = await planItinerary(input, fakes([goodPlan], found(3.14, 101.69)).deps); // Kuala Lumpur
    expect(result.stops[0]).toMatchObject({ lat: 5.41, placeId: null, address: null });
  });

  it('keeps going when a Google lookup fails', async () => {
    const broken = async () => {
      throw new Error('Google 500');
    };
    const result = await planItinerary(input, fakes([goodPlan], broken).deps);
    expect(result.stops).toHaveLength(8);
  });

  it('never looks up a stop that already has a place ID, or a made-up sample stop', async () => {
    const lookups: string[] = [];
    const deps: PlannerDeps = {
      ask: null,
      findPlace: async (q) => {
        lookups.push(q);
        return { value: null, limited: false, calls: 1 };
      },
    };
    await planItinerary({ ...input, destination: 'Melaka' }, deps); // generic sample: "local café" etc.
    expect(lookups).toEqual([]);
  });

  it('works with no Gemini and no Google', async () => {
    const result = await planItinerary(input, { ask: null, findPlace: null });
    expect(result).toMatchObject({ source: 'sample', note: null, googleCalls: 0 });
  });
});
