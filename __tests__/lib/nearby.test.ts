// Running early's nearby suggestion: the Places Nearby Search client with a fake fetch,
// cache, lock and daily counter, and the simple picking rules. No real Google calls.
import {
  areaOf,
  DAILY_NEARBY_LIMIT,
  distanceText,
  fillMinutes,
  groupPrefs,
  legMinutes,
  matchesNoGo,
  metersBetween,
  NEARBY_FIELDS,
  NEARBY_URL,
  nearbyFor,
  nearbyKeys,
  pickSuggestion,
  typesToSearch,
  type NearbyDeps,
  type NearbyPlace,
  type NearbyRequest,
} from '@/supabase/functions/_shared/nearby';

const MIN = 60_000;
const NOW = Date.parse('2026-10-12T04:52:00Z'); // 12:52 in Penang

// Around Kek Lok Si, Air Itam.
const here = { lat: 5.3998, lng: 100.2734 };
const nextStop = { lat: 5.4172, lng: 100.3364, isFood: true }; // Chulia Street, ~7 km

/** A place `east` / `north` metres from here. */
function place(id: string, name: string, types: string[], east: number, north = 0): NearbyPlace {
  return {
    placeId: id,
    name,
    types,
    lat: here.lat + north / 110_540,
    lng: here.lng + east / (111_320 * Math.cos((here.lat * Math.PI) / 180)),
  };
}

const kettle = place('p-kettle', 'Black Kettle', ['cafe', 'food', 'point_of_interest'], 300);
const museum = place('p-museum', 'Air Itam Museum', ['museum', 'tourist_attraction'], 200);
const park = place('p-park', 'Air Itam Dam Park', ['park', 'tourist_attraction'], 120);
const nasi = place('p-nasi', 'Nasi Kandar Air Itam', ['restaurant', 'food'], 150);
const seafood = place('p-sea', 'Ah Ma Seafood', ['seafood_restaurant', 'restaurant'], 100);
const veg = place('p-veg', 'Kuan Yin Vegetarian', ['vegetarian_restaurant', 'restaurant'], 400);
const trail = place('p-trail', 'Air Itam Hiking Trail', ['hiking_area', 'park'], 80);

function request(extra: Partial<NearbyRequest> = {}, prefs: Partial<NearbyRequest['prefs']> = {}): NearbyRequest {
  return {
    stopId: 'stop-chulia',
    from: here,
    next: nextStop,
    spareMin: 70,
    localMinutes: 16 * 60, // 16:00: not a meal time
    planned: { placeIds: [], names: [] },
    prefs: { mustHaves: [], foodNeeds: [], noGos: [], budgetLeft: null, ...prefs },
    ...extra,
  };
}

type Reply = { status?: number; body: unknown };

function fakeGoogle(replies: Reply[], opts: { limit?: number; locked?: string[] } = {}) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const cache = new Map<string, unknown>();
  const locks = new Set<string>(opts.locked ?? []);
  let used = 0;
  let clock = NOW;
  const deps: NearbyDeps = {
    apiKey: 'test-key',
    fetch: async (url, init) => {
      requests.push({ url, init });
      const reply = replies.shift();
      if (!reply) throw new Error(`unexpected Google request: ${url}`);
      return {
        ok: (reply.status ?? 200) < 400,
        status: reply.status ?? 200,
        json: async () => reply.body,
        text: async () => JSON.stringify(reply.body),
      } as Response;
    },
    takeCall: async () => (used < (opts.limit ?? DAILY_NEARBY_LIMIT) ? (used++, true) : false),
    cacheGet: async (key) => cache.get(key),
    cacheSet: async (key, data) => {
      cache.set(key, data);
    },
    claim: async (key) => {
      if (locks.has(key)) return false;
      locks.add(key);
      return true;
    },
    release: async (key) => {
      locks.delete(key);
    },
    wait: async () => {},
    now: () => clock,
  };
  return { deps, requests, cache, locks, used: () => used, later: (ms: number) => (clock += ms) };
}

/** Google's reply for some places. */
const googleBody = (places: NearbyPlace[]) => ({
  places: places.map((p) => ({
    id: p.placeId,
    displayName: { text: p.name, languageCode: 'en' },
    location: { latitude: p.lat, longitude: p.lng },
    types: p.types,
  })),
});

describe('pickSuggestion', () => {
  it("prefers the group's must-haves, most chosen first, then the nearest", () => {
    const picked = pickSuggestion([park, museum, kettle], request({}, { mustHaves: ['Cafés', 'Museums'] }));
    expect(picked?.placeId).toBe('p-kettle');
    expect(picked?.reason).toBe("Café 300 m away · matches your 'cafés' must-have");
    // No must-have matches: the nearest that fits.
    const nearest = pickSuggestion([museum, kettle, park], request({}, { mustHaves: ['Beach'] }));
    expect(nearest?.placeId).toBe('p-park');
    expect(nearest?.reason).toBe('Park 100 m away · fits your free time');
  });

  it('estimates the price from the place type, with the walk and the budget', () => {
    expect(pickSuggestion([park], request())).toMatchObject({ price: 0, outdoor: true, category: 'sight', withinBudget: null });
    expect(pickSuggestion([museum], request({}, { budgetLeft: 40 }))).toMatchObject({ price: 10, withinBudget: true });
    const cafe = pickSuggestion([kettle], request({}, { budgetLeft: 40 }))!;
    expect(cafe).toMatchObject({ kind: 'Café', price: 15, category: 'food', walkMin: 4, distanceM: 300 });
  });

  it('skips places over what is left of the budget today (free ones always fit)', () => {
    expect(pickSuggestion([kettle], request({}, { budgetLeft: 12 }))).toBeNull();
    expect(pickSuggestion([kettle, park], request({}, { budgetLeft: 0 }))?.placeId).toBe('p-park');
  });

  it('only suggests a meal near a meal time, and not right before a food stop', () => {
    const lunch = 12 * 60 + 50;
    expect(pickSuggestion([nasi], request())).toBeNull(); // 16:00
    expect(pickSuggestion([nasi], request({ localMinutes: lunch }))).toBeNull(); // next stop is food
    const meal = pickSuggestion([nasi], request({ localMinutes: lunch, next: { ...nextStop, isFood: false } }));
    expect(meal).toMatchObject({ placeId: 'p-nasi', kind: 'Restaurant', price: 20 });
    // Cafés are fine any time.
    expect(pickSuggestion([kettle], request())?.placeId).toBe('p-kettle');
  });

  it('labels food "Halal-friendly · not verified" when anyone needs halal', () => {
    expect(pickSuggestion([kettle], request({}, { foodNeeds: ['Halal'] }))?.halalNote).toBe(true);
    expect(pickSuggestion([park], request({}, { foodNeeds: ['Halal'] }))?.halalNote).toBe(false);
    expect(pickSuggestion([kettle], request())?.halalNote).toBe(false);
  });

  it("keeps to everyone's food needs", () => {
    const lunch = request({ localMinutes: 13 * 60, next: { ...nextStop, isFood: false } }, { foodNeeds: ['Vegetarian', 'No seafood'] });
    expect(pickSuggestion([seafood, nasi, veg], lunch)?.placeId).toBe('p-veg');
    expect(pickSuggestion([seafood], request({ localMinutes: 13 * 60, next: { ...nextStop, isFood: false } }, { foodNeeds: ['No seafood'] }))).toBeNull();
  });

  it("skips anything matching the group's no-go", () => {
    expect(pickSuggestion([trail, park], request({}, { noGos: ['Long hikes'] }))?.placeId).toBe('p-park');
    expect(matchesNoGo(museum, ['museums'])).toBe(true); // typed by a member
    expect(matchesNoGo(museum, ['Early mornings'])).toBe(false);
  });

  it('skips places already in the plan (by place ID or name)', () => {
    expect(pickSuggestion([kettle, park], request({ planned: { placeIds: ['p-park'], names: [] } }))?.placeId).toBe('p-kettle');
    expect(pickSuggestion([kettle], request({ planned: { placeIds: [], names: ['black  kettle'] } }))).toBeNull();
  });

  it('needs at least 20 min there after walking there and on to the next stop', () => {
    const toNext = legMinutes(kettle, nextStop);
    const there = legMinutes(here, kettle);
    expect(pickSuggestion([kettle], request({ spareMin: there + toNext + 20 }))).not.toBeNull();
    expect(pickSuggestion([kettle], request({ spareMin: there + toNext + 19 }))).toBeNull();
  });

  it('ignores places of a kind it has no price for', () => {
    expect(pickSuggestion([place('p-atm', 'ATM', ['atm'], 10)], request())).toBeNull();
  });
});

describe('helpers', () => {
  it('walks up to 1.2 km at 80 m/min, rides further at 25 km/h', () => {
    expect(legMinutes(here, kettle)).toBe(4);
    expect(metersBetween(here, nextStop)).toBeGreaterThan(1200);
    expect(legMinutes(here, nextStop)).toBe(Math.ceil((metersBetween(here, nextStop) / 1000 / 25) * 60));
    expect(fillMinutes(90, 5, 10)).toBe(60);
    expect(fillMinutes(40, 5, 10)).toBe(25);
  });

  it('formats distances', () => {
    expect(distanceText(312)).toBe('300 m');
    expect(distanceText(20)).toBe('50 m');
    expect(distanceText(1240)).toBe('1.2 km');
  });

  it('puts points within ~500 m in the same area', () => {
    const centre = { lat: 5.4001, lng: 100.2749 };
    expect(areaOf(centre).key).toBe(areaOf({ lat: centre.lat + 0.002, lng: centre.lng - 0.002 }).key);
    expect(areaOf(centre).centre).toEqual({ lat: 5.4, lng: 100.275 });
    expect(areaOf(here).key).not.toBe(areaOf({ lat: here.lat + 0.006, lng: here.lng }).key);
  });

  it("searches the must-haves' place types, else a few that suit anyone; meals only at meal times", () => {
    expect(typesToSearch(request({}, { mustHaves: ['Cafés', 'Beach'] }))).toEqual(['bakery', 'cafe', 'coffee_shop']);
    expect(typesToSearch(request())).toEqual(['cafe', 'coffee_shop', 'museum', 'park', 'tourist_attraction']);
    expect(typesToSearch(request({}, { mustHaves: ['Street food'] }))).not.toContain('restaurant');
    expect(typesToSearch(request({ localMinutes: 13 * 60, next: { ...nextStop, isFood: false } }, { mustHaves: ['Street food'] }))).toContain('restaurant');
  });

  it("sums up the group's answers: must-haves by popularity, lowest budget minus today's stops", () => {
    const g = groupPrefs(
      [
        { daily_budget: 150, food_needs: ['Halal'], must_haves: ['Museums', 'Cafés'], no_go: 'Long hikes' },
        { daily_budget: '120', food_needs: ['Anything'], must_haves: ['Cafés'], no_go: null },
        { daily_budget: null, food_needs: [], must_haves: [], no_go: '' },
      ],
      [
        { name: 'Kek Lok Si', place_id: 'p-kls', day_number: 1, status: 'done', price: 0, actual_cost: null },
        { name: 'Penang Hill', place_id: null, day_number: 1, status: 'done', price: 30, actual_cost: 35 },
        { name: 'Chulia Street', place_id: 'p-chulia', day_number: 1, status: 'planned', price: 16, actual_cost: null },
        { name: 'Dropped', place_id: 'p-drop', day_number: 1, status: 'dropped', price: 50, actual_cost: null },
        { name: 'Day 2', place_id: 'p-d2', day_number: 2, status: 'planned', price: 40, actual_cost: null },
      ],
      1,
    );
    expect(g.prefs).toEqual({ mustHaves: ['Cafés', 'Museums'], foodNeeds: ['Halal', 'Anything'], noGos: ['Long hikes'], budgetLeft: 69 });
    expect(g.planned.placeIds).toEqual(['p-kls', 'p-chulia', 'p-d2']);
  });
});

describe('nearbyFor', () => {
  it('asks Google once with a field mask of id, name, location and types, around the area', async () => {
    const g = fakeGoogle([{ body: googleBody([kettle, museum]) }]);
    const reply = await nearbyFor(g.deps, request({}, { mustHaves: ['Cafés'] }));
    expect(reply).toMatchObject({ limited: false, placesCalls: 1 });
    expect(reply.suggestion?.placeId).toBe('p-kettle');
    expect(g.requests).toHaveLength(1);
    const { url, init } = g.requests[0];
    expect(url).toBe(NEARBY_URL);
    expect((init!.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(NEARBY_FIELDS);
    expect(NEARBY_FIELDS).toBe('places.id,places.displayName,places.location,places.types');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ includedTypes: ['bakery', 'cafe', 'coffee_shop'], maxResultCount: 5, rankPreference: 'DISTANCE' });
    expect(body.locationRestriction.circle).toEqual({ center: { latitude: 5.4, longitude: 100.275 }, radius: 1000 });
  });

  it('saves the pick for the stop: the rest of the group reads it, no second call', async () => {
    const g = fakeGoogle([{ body: googleBody([park]) }]);
    await nearbyFor(g.deps, request());
    const again = await nearbyFor(g.deps, request({ from: { lat: here.lat + 0.0005, lng: here.lng } }));
    expect(again).toMatchObject({ placesCalls: 0 });
    expect(again.suggestion?.placeId).toBe('p-park');
    expect(g.requests).toHaveLength(1);
  });

  it('reuses the same area for another stop within the hour, then asks again', async () => {
    const g = fakeGoogle([{ body: googleBody([park]) }, { body: googleBody([museum]) }]);
    await nearbyFor(g.deps, request({ stopId: 'a' }));
    expect((await nearbyFor(g.deps, request({ stopId: 'b' }))).placesCalls).toBe(0);
    expect(g.requests).toHaveLength(1);
    g.later(61 * MIN);
    const fresh = await nearbyFor(g.deps, request({ stopId: 'c' }));
    expect(fresh).toMatchObject({ placesCalls: 1 });
    expect(fresh.suggestion?.placeId).toBe('p-museum');
    expect(g.cache.has(nearbyKeys.area(here, typesToSearch(request())))).toBe(true);
  });

  it('waits for the phone already asking about the same stop, then reads its answer', async () => {
    const g = fakeGoogle([], { locked: [nearbyKeys.pick('stop-chulia')] });
    let waits = 0;
    g.deps.wait = async () => {
      waits += 1;
      if (waits === 2) g.cache.set(nearbyKeys.pick('stop-chulia'), { at: NOW, value: { placeId: 'p-park', name: 'Air Itam Dam Park' } });
    };
    const reply = await nearbyFor(g.deps, request());
    expect(reply.suggestion?.placeId).toBe('p-park');
    expect(g.requests).toHaveLength(0);
  });

  it('stops at 10 searches per trip per day: no suggestion, and says so', async () => {
    const g = fakeGoogle([], { limit: 0 });
    expect(await nearbyFor(g.deps, request())).toEqual({ suggestion: null, limited: true, placesCalls: 0 });
    expect(DAILY_NEARBY_LIMIT).toBe(10);
  });

  it('shows "Enjoy the extra time" when Google fails, and no other phone pays for the same failure', async () => {
    const errors: unknown[] = [];
    const g = fakeGoogle([{ status: 403, body: { error: { message: 'API key not valid' } } }]);
    const reply = await nearbyFor(g.deps, request(), (e) => errors.push(e));
    expect(reply).toEqual({ suggestion: null, limited: false, placesCalls: 1 });
    expect(errors).toHaveLength(1);
    expect((await nearbyFor(g.deps, request())).placesCalls).toBe(0);
    expect(g.locks.size).toBe(0);
  });

  it('gives no suggestion when nothing fits (and saves that too)', async () => {
    const g = fakeGoogle([{ body: { places: [] } }]);
    expect((await nearbyFor(g.deps, request())).suggestion).toBeNull();
    expect(g.cache.get(nearbyKeys.pick('stop-chulia'))).toEqual({ at: NOW, value: null });
  });
});
