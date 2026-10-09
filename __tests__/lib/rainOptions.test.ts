// Rain backup's indoor options: the shared Places Nearby Search client with a fake fetch,
// cache, lock and daily counter, and the simple picking rules. No real Google calls.
import {
  DAILY_NEARBY_LIMIT,
  NEARBY_FIELDS,
  NEARBY_URL,
  nearbyKeys,
  pickRainOptions,
  RAIN_MAX_RESULTS,
  rainOptionsFor,
  rainTypes,
  type NearbyDeps,
  type NearbyPlace,
  type RainRequest,
} from '@/supabase/functions/_shared/nearby';

const MIN = 60_000;
const NOW = Date.parse('2026-10-13T02:20:00Z'); // 10:20 in Penang

// Batu Ferringhi beach.
const here = { lat: 5.4721, lng: 100.2459 };

function place(id: string, name: string, types: string[], east: number, north = 0): NearbyPlace {
  return {
    placeId: id,
    name,
    types,
    lat: here.lat + north / 110_540,
    lng: here.lng + east / (111_320 * Math.cos((here.lat * Math.PI) / 180)),
  };
}

const market = place('p-mall', 'Batu Ferringhi covered market', ['shopping_mall'], 450);
const museum = place('p-museum', 'Toy Museum', ['museum', 'tourist_attraction'], 700);
const cafe = place('p-cafe', 'Beach Café', ['cafe', 'food'], 200);
const cinema = place('p-cinema', 'Ferringhi Cinema', ['movie_theater'], 1500);
const aquarium = place('p-aqua', 'Ocean Aquarium', ['aquarium', 'tourist_attraction'], 900);
const parkCafe = place('p-parkcafe', 'Garden Kopi', ['cafe', 'park'], 100);
const beachBar = place('p-bar', 'Sunset Beach Bar', ['bar', 'cafe'], 150);
const nasi = place('p-nasi', 'Nasi Kandar Ferringhi', ['restaurant', 'food'], 300);
const seafood = place('p-sea', 'Ferringhi Seafood', ['seafood_restaurant', 'restaurant'], 250);
const park = place('p-park', 'Ferringhi Park', ['park'], 50);

function request(extra: Partial<RainRequest> = {}, prefs: Partial<RainRequest['prefs']> = {}): RainRequest {
  return {
    stopId: 'stop-beach',
    from: here,
    localMinutes: 10 * 60 + 20, // 10:20: not a meal time
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

const googleBody = (places: NearbyPlace[]) => ({
  places: places.map((p) => ({
    id: p.placeId,
    displayName: { text: p.name, languageCode: 'en' },
    location: { latitude: p.lat, longitude: p.lng },
    types: p.types,
  })),
});
const bodyOf = (r: { init?: RequestInit }) => JSON.parse(String(r.init?.body));

describe('rainTypes', () => {
  it('indoor types only; restaurants only near a meal time', () => {
    expect(rainTypes(10 * 60)).toEqual(['aquarium', 'art_gallery', 'cafe', 'coffee_shop', 'movie_theater', 'museum', 'shopping_mall']);
    expect(rainTypes(12 * 60 + 30)).toEqual(expect.arrayContaining(['restaurant', 'vegetarian_restaurant', 'vegan_restaurant']));
    expect(rainTypes(10 * 60)).not.toContain('park');
    expect(rainTypes(10 * 60)).not.toContain('tourist_attraction');
  });
});

describe('pickRainOptions', () => {
  it('three indoor options, nearest first, with walk (or ride) time and a rough price', () => {
    const options = pickRainOptions([museum, market, cafe, aquarium], request());
    expect(options.map((o) => o.placeId)).toEqual(['p-cafe', 'p-mall', 'p-museum']);
    expect(options[0]).toMatchObject({ kind: 'Café', price: 15, walkMin: 3, ride: false, category: 'food' });
    expect(options[1]).toMatchObject({ kind: 'Mall', price: 0 });
    const far = pickRainOptions([cinema], request())[0];
    expect(far).toMatchObject({ kind: 'Cinema', ride: true, price: 15 });
  });

  it('never offers anything outdoor, even a café in a park', () => {
    expect(pickRainOptions([park, parkCafe], request())).toEqual([]);
  });

  it('must-haves first, then the nearest (shown nearest first)', () => {
    const farMuseum = place('p-far', 'Penang Toy Museum', ['museum', 'tourist_attraction'], 1100);
    const places = [cafe, market, aquarium, farMuseum];
    expect(pickRainOptions(places, request()).map((o) => o.placeId)).toEqual(['p-cafe', 'p-mall', 'p-aqua']);
    const museums = pickRainOptions(places, request({}, { mustHaves: ['Museums'] }));
    expect(museums.map((o) => o.placeId)).toEqual(['p-cafe', 'p-mall', 'p-far']);
    expect(museums[2].mustHave).toBe('Museums');
  });

  it('an aquarium that is also a tourist attraction is still an aquarium', () => {
    expect(pickRainOptions([aquarium], request())[0]).toMatchObject({ kind: 'Aquarium', price: 30 });
  });

  it('skips places in the plan, no-gos and anything over the budget left', () => {
    const planned = pickRainOptions([cafe, market], request({ planned: { placeIds: ['p-mall'], names: [] } }));
    expect(planned.map((o) => o.placeId)).toEqual(['p-cafe']);
    const byName = pickRainOptions([cafe, market], request({ planned: { placeIds: [], names: ['beach café'] } }));
    expect(byName.map((o) => o.placeId)).toEqual(['p-mall']);
    expect(pickRainOptions([beachBar], request({}, { noGos: ['Late nights'] }))).toEqual([]);
    const cheap = pickRainOptions([cafe, aquarium, market], request({}, { budgetLeft: 10 }));
    expect(cheap.map((o) => o.placeId)).toEqual(['p-mall']);
  });

  it('restaurants only at a meal time, with the food needs; halal gets the note', () => {
    expect(pickRainOptions([nasi], request())).toEqual([]);
    const lunch = request({ localMinutes: 12 * 60 + 30 }, { foodNeeds: ['Halal', 'No seafood'] });
    const options = pickRainOptions([nasi, seafood, market], lunch);
    expect(options.map((o) => o.placeId)).toEqual(['p-nasi', 'p-mall']);
    expect(options[0].halalNote).toBe(true);
    expect(options[1].halalNote).toBe(false);
    expect(pickRainOptions([nasi], request({ localMinutes: 12 * 60 + 30 }, { foodNeeds: ['Vegetarian'] }))).toEqual([]);
  });
});

describe('rainOptionsFor (fake Google)', () => {
  it('one 1 km search with indoor types and the cheap field mask; 3 fit = done', async () => {
    const g = fakeGoogle([{ body: googleBody([cafe, market, museum]) }]);
    const reply = await rainOptionsFor(g.deps, request());
    expect(reply).toMatchObject({ limited: false, placesCalls: 1 });
    expect(reply.options).toHaveLength(3);
    const [{ url, init }] = g.requests;
    expect(url).toBe(NEARBY_URL);
    expect((init?.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(NEARBY_FIELDS);
    const body = bodyOf(g.requests[0]);
    expect(body.includedTypes).toEqual(rainTypes(request().localMinutes));
    expect(body.maxResultCount).toBe(RAIN_MAX_RESULTS);
    expect(body.locationRestriction.circle.radius).toBe(1000);
  });

  it('fewer than 3 within 1 km: once more within 2 km, both picked together', async () => {
    const g = fakeGoogle([{ body: googleBody([cafe]) }, { body: googleBody([cafe, market, cinema]) }]);
    const reply = await rainOptionsFor(g.deps, request());
    expect(reply.placesCalls).toBe(2);
    expect(bodyOf(g.requests[1]).locationRestriction.circle.radius).toBe(2000);
    expect(reply.options.map((o) => o.placeId)).toEqual(['p-cafe', 'p-mall', 'p-cinema']);
  });

  it('saved for the stop: the second phone reads it, no Google call', async () => {
    const g = fakeGoogle([{ body: googleBody([cafe, market, museum]) }]);
    await rainOptionsFor(g.deps, request());
    const again = await rainOptionsFor(g.deps, request());
    expect(again.placesCalls).toBe(0);
    expect(again.options).toHaveLength(3);
    expect(g.requests).toHaveLength(1);
    expect(g.cache.has(nearbyKeys.rain('stop-beach'))).toBe(true);
  });

  it('another stop in the same ~500 m area within the hour reuses the area search', async () => {
    const g = fakeGoogle([{ body: googleBody([cafe, market, museum]) }]);
    await rainOptionsFor(g.deps, request());
    g.later(30 * MIN);
    const other = await rainOptionsFor(g.deps, request({ stopId: 'stop-other', from: { lat: here.lat - 0.0003, lng: here.lng } }));
    expect(other.placesCalls).toBe(0);
    expect(other.options).toHaveLength(3);
  });

  it('while another phone asks, waits and reads; gives up with no options if it never saves', async () => {
    const g = fakeGoogle([], { locked: [nearbyKeys.rain('stop-beach')] });
    const reply = await rainOptionsFor(g.deps, request());
    expect(reply).toEqual({ options: [], limited: false, placesCalls: 0 });
    expect(g.requests).toHaveLength(0);
  });

  it('nothing usable: [] (consider moving it), kept only 10 min', async () => {
    const g = fakeGoogle([{ body: googleBody([]) }, { body: googleBody([]) }, { body: googleBody([market]) }, { body: googleBody([]) }]);
    expect((await rainOptionsFor(g.deps, request())).options).toEqual([]);
    g.later(9 * MIN);
    expect((await rainOptionsFor(g.deps, request())).placesCalls).toBe(0);
    g.later(2 * MIN);
    const retry = await rainOptionsFor(g.deps, request());
    expect(retry.options.map((o) => o.placeId)).toEqual(['p-mall']);
  });

  it('Google fails: no options, no second search, never throws', async () => {
    const errors: unknown[] = [];
    const g = fakeGoogle([{ status: 500, body: { error: 'boom' } }]);
    const reply = await rainOptionsFor(g.deps, request(), (e) => errors.push(e));
    expect(reply.options).toEqual([]);
    expect(g.requests).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it("shares running early's daily limit: none left = limited, no Google call", async () => {
    const g = fakeGoogle([], { limit: 0 });
    const reply = await rainOptionsFor(g.deps, request());
    expect(reply).toEqual({ options: [], limited: true, placesCalls: 0 });
    expect(g.requests).toHaveLength(0);
  });
});
