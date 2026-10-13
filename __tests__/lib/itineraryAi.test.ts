// generate-itinerary logic with fake Gemini and Google answers. No real API calls.
import {
  buildItineraryPrompt,
  checkItinerary,
  fitToBudget,
  GOOGLE_LIMIT_NOTE,
  localNow,
  MALAYSIA_TIME_ZONE,
  noTimeTodayNote,
  planItinerary,
  planTotal,
  todayWindow,
  tripTimeZone,
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
    expect(result.status).toBe('ok');
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
    expect(result.status).toBe('ok');
    expect(f.prompts).toHaveLength(2);
    expect(f.prompts[1]).toContain('Your last answer had a problem: The answer was not valid JSON.');
  });

  it('never falls back to a sample plan: two bad answers = busy, no stops', async () => {
    const f = fakes(['nope', '{"days": []}']);
    const result = await planItinerary(input, f.deps);
    expect(result).toMatchObject({ status: 'busy', stops: [], note: null, googleCalls: 0 });
  });

  it('makes a plan that is still over budget after the retry fit', async () => {
    const expensive = JSON.stringify({ days: [day(1, 100), day(2, 100)] });
    const result = await planItinerary(input, fakes([expensive, expensive]).deps);
    expect(result.status).toBe('ok');
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

  it('makes no Google lookups when there is no AI plan', async () => {
    const lookups: string[] = [];
    const deps: PlannerDeps = {
      ask: null,
      findPlace: async (q) => {
        lookups.push(q);
        return { value: null, limited: false, calls: 1 };
      },
    };
    expect((await planItinerary({ ...input, destination: 'Melaka' }, deps)).stops).toEqual([]);
    expect(lookups).toEqual([]);
  });

  it('gives no plan without Gemini (never a sample plan)', async () => {
    const result = await planItinerary(input, { ask: null, findPlace: null });
    expect(result).toMatchObject({ status: 'busy', stops: [], note: null, googleCalls: 0 });
  });
});

describe('a trip day that is today', () => {
  // Trip starts today (Day 1 = 2026-10-12) and the plan is built at 21:00 Malaysia time.
  const at2100 = { date: '2026-10-12', minutes: 21 * 60 };
  const today = todayWindow('2026-10-12', 2, at2100);
  const tonight = { ...input, today };
  const evening = {
    day: 1,
    stops: [
      stop('Dinner at Kapitan', '21:30', '22:30', 15, { category: 'food', halal: true, estimate: true, outdoor: false }),
      stop('Dessert at Chulia Street', '22:45', '23:30', 8, { category: 'food', halal: true, estimate: true }),
    ],
  };

  it('works out "now" in the trip time zone (Malaysia unless the destination is known)', () => {
    expect(tripTimeZone('Penang')).toBe(MALAYSIA_TIME_ZONE);
    expect(tripTimeZone('Bali · Beach & chill')).toBe('Asia/Jakarta');
    expect(tripTimeZone('Somewhere new')).toBe(MALAYSIA_TIME_ZONE);
    // 13:00 UTC = 21:00 in Malaysia (UTC+8), 20:00 in Bali's zone (UTC+7).
    expect(localNow(new Date('2026-10-12T13:00:00Z'), MALAYSIA_TIME_ZONE)).toEqual({ date: '2026-10-12', minutes: 21 * 60 });
    expect(localNow(new Date('2026-10-12T13:00:00Z'), 'Asia/Jakarta')).toEqual({ date: '2026-10-12', minutes: 20 * 60 });
    expect(localNow(new Date('2026-10-12T16:30:00Z'), MALAYSIA_TIME_ZONE)).toEqual({ date: '2026-10-13', minutes: 30 });
  });

  it('starts today 30 min from now (rounded up to 5 min); no stops with under an hour left', () => {
    expect(today).toEqual({ day: 1, now: '21:00', earliest: '21:30' });
    expect(todayWindow('2026-10-12', 2, { date: '2026-10-12', minutes: 21 * 60 + 2 })?.earliest).toBe('21:35');
    expect(todayWindow('2026-10-11', 3, at2100)).toMatchObject({ day: 2, earliest: '21:30' });
    expect(todayWindow('2026-10-12', 2, { date: '2026-10-12', minutes: 22 * 60 + 59 })).toEqual({ day: 1, now: '22:59', earliest: '23:30' });
    expect(todayWindow('2026-10-12', 2, { date: '2026-10-12', minutes: 23 * 60 })).toEqual({ day: 1, now: '23:00', earliest: null });
    // Days in the future (or no dates) are planned normally.
    expect(todayWindow('2026-10-13', 2, at2100)).toBeNull();
    expect(todayWindow(null, 2, at2100)).toBeNull();
  });

  it('tells Gemini the earliest start and the 23:59 end for today only', () => {
    const prompt = buildItineraryPrompt(tonight);
    expect(prompt).toContain('Day 1 Monday 2026-10-12 (theme: George Town) - TODAY, and it is already 21:00 there: every stop starts at 21:30 or later and ends by 23:59');
    expect(prompt).toContain('dinner, a night market or dessert');
    expect(prompt).toContain('Day 2 Tuesday 2026-10-13 (theme: Beach)\n');
    expect(buildItineraryPrompt(input)).not.toContain('TODAY');
  });

  it('accepts a short evening for today, and the other days as usual', () => {
    const stops = checkItinerary(JSON.stringify({ days: [evening, day(2)] }), tonight);
    expect(stops.filter((s) => s.day === 1).map((s) => s.time)).toEqual(['21:30', '22:45']);
    expect(stops.filter((s) => s.day === 2)).toHaveLength(4);
  });

  it('rejects a stop on today that starts too soon or in the past', () => {
    expect(() => checkItinerary(JSON.stringify({ days: [day(1), day(2)] }), tonight)).toThrow(
      '"Sight 1A" starts at 09:00 on day 1, which is today: it is already 21:00, so stops start at 21:30 or later.',
    );
    const soon = { day: 1, stops: [stop('Night market', '21:15', '22:30', 10)] };
    expect(() => checkItinerary(JSON.stringify({ days: [soon, day(2)] }), tonight)).toThrow('starts at 21:15');
  });

  it('rejects a stop on today that crosses midnight', () => {
    const late = { day: 1, stops: [stop('Night market', '22:00', '00:30', 10)] };
    expect(() => checkItinerary(JSON.stringify({ days: [late, day(2)] }), tonight)).toThrow('ends before it starts');
  });

  it('plans no stops today with under an hour left, the other days normally, with a note', async () => {
    const at2310 = { ...input, today: todayWindow('2026-10-12', 2, { date: '2026-10-12', minutes: 23 * 60 + 10 }) };
    const f = fakes([JSON.stringify({ days: [{ day: 1, stops: [] }, day(2)] })]);
    const result = await planItinerary(at2310, f.deps);
    expect(result.status).toBe('ok');
    expect(result.stops.every((s) => s.day === 2)).toBe(true);
    expect(result.stops).toHaveLength(4);
    expect(result.note).toBe(noTimeTodayNote(1));
    expect(f.prompts[0]).toContain('not enough time left, so no stops');
  });

  it('retries with the reason when Gemini plans today in the past', async () => {
    const f = fakes([goodPlan, JSON.stringify({ days: [evening, day(2)] })]);
    const result = await planItinerary(tonight, f.deps);
    expect(result.status).toBe('ok');
    expect(f.prompts[1]).toContain('which is today: it is already 21:00');
    expect(result.stops.filter((s) => s.day === 1).every((s) => s.time >= '21:30' && (s.endTime ?? '') <= '23:59')).toBe(true);
  });
});
