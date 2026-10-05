// Running-late travel time: the free estimate and the Google Routes client with a fake
// fetch, cache, lock and daily counter. No real Google calls.
import {
  DAILY_ROUTES_LIMIT,
  estimateMinutes,
  etaFor,
  etaKey,
  isLate,
  parseDuration,
  ROUTES_URL,
  worthAskingGoogle,
  type EtaDeps,
} from '@/supabase/functions/_shared/eta';

const MIN = 60_000;
const NOW = Date.parse('2026-10-12T01:08:00Z'); // 09:08 in Penang

const hotel = { lat: 5.4183, lng: 100.3376 }; // Muntri Street
const funicular = { lat: 5.4239, lng: 100.2691 }; // ~7.6 km away
const murals = { lat: 5.4151, lng: 100.3376 }; // ~360 m from the hotel

type Reply = { status?: number; body: unknown };

function fakeRoutes(replies: Reply[], opts: { limit?: number; locked?: string[] } = {}) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const cache = new Map<string, unknown>();
  const locks = new Set<string>(opts.locked ?? []);
  let used = 0;
  const deps: EtaDeps = {
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
    takeCall: async () => (used < (opts.limit ?? DAILY_ROUTES_LIMIT) ? (used++, true) : false),
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
    now: () => NOW,
  };
  return { deps, requests, cache, locks, used: () => used };
}

const route = (seconds: number) => ({ body: { routes: [{ duration: `${seconds}s` }] } });
const req = { stopId: 'funicular', kind: 'before' as const, from: hotel, to: funicular };

describe('free estimate and the late rule', () => {
  it('estimates the straight line at 25 km/h, rounded up', () => {
    expect(estimateMinutes(hotel, funicular)).toBe(19); // ~7.6 km
    expect(estimateMinutes(hotel, murals)).toBe(1);
    expect(estimateMinutes(hotel, hotel)).toBe(1);
  });

  it('is late when now + travel is more than 5 min after the start', () => {
    const start = NOW + 20 * MIN;
    expect(isLate(NOW, 25, start)).toBe(false); // exactly 5 min after
    expect(isLate(NOW, 26, start)).toBe(true);
  });

  it('only asks Google when the estimate gets within 10 min of the start, or later', () => {
    const start = NOW + 30 * MIN;
    expect(worthAskingGoogle(NOW, 19, start)).toBe(false); // 11 min to spare
    expect(worthAskingGoogle(NOW, 20, start)).toBe(true);
    expect(worthAskingGoogle(NOW, 45, start)).toBe(true);
  });

  it("reads Google's durations", () => {
    expect(parseDuration('1320s')).toBe(1320);
    expect(parseDuration('61.5s')).toBe(61.5);
    expect(parseDuration('20 min')).toBeNull();
    expect(parseDuration(undefined)).toBeNull();
  });
});

describe('etaFor (Google Routes)', () => {
  it('asks for a driving time with only the duration, and saves it', async () => {
    const g = fakeRoutes([route(1320)]);
    expect(await etaFor(g.deps, req)).toEqual({ minutes: 22, source: 'google', limited: false, routesCalls: 1 });
    expect(g.requests).toHaveLength(1);
    const { url, init } = g.requests[0];
    expect(url).toBe(ROUTES_URL);
    const headers = init!.headers as Record<string, string>;
    expect(headers['X-Goog-FieldMask']).toBe('routes.duration');
    expect(headers['X-Goog-Api-Key']).toBe('test-key');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' });
    expect(body.origin.location.latLng).toEqual({ latitude: hotel.lat, longitude: hotel.lng });
    expect(g.cache.get(etaKey('funicular', 'before'))).toEqual({ at: NOW, minutes: 22 });
    expect(g.locks.size).toBe(0);
  });

  it('asks for a walking time for short distances', async () => {
    const g = fakeRoutes([route(300)]);
    await etaFor(g.deps, { ...req, to: murals });
    const body = JSON.parse(g.requests[0].init!.body as string);
    expect(body.travelMode).toBe('WALK');
    expect(body.routingPreference).toBeUndefined();
  });

  it('only one phone asks: the rest of the group reads the saved answer', async () => {
    const g = fakeRoutes([route(1320)]);
    await etaFor(g.deps, req);
    const again = await etaFor(g.deps, req);
    expect(again).toEqual({ minutes: 22, source: 'google', limited: false, routesCalls: 0 });
    expect(g.requests).toHaveLength(1);
    expect(g.used()).toBe(1);
  });

  it('waits for the phone that is asking right now instead of asking too', async () => {
    const g = fakeRoutes([], { locked: [etaKey('funicular', 'before')] });
    let polls = 0;
    g.deps.wait = async () => {
      polls += 1;
      if (polls === 2) g.cache.set(etaKey('funicular', 'before'), { at: NOW, minutes: 24 });
    };
    expect(await etaFor(g.deps, req)).toEqual({ minutes: 24, source: 'google', limited: false, routesCalls: 0 });
    expect(g.requests).toHaveLength(0);
  });

  it('gives up waiting and uses the free estimate if the other phone is slow', async () => {
    const g = fakeRoutes([], { locked: [etaKey('funicular', 'before')] });
    expect(await etaFor(g.deps, req)).toEqual({ minutes: null, source: null, limited: false, routesCalls: 0 });
  });

  it('keeps a separate answer for the "left" check of the same stop', async () => {
    const g = fakeRoutes([route(1320), route(900)]);
    await etaFor(g.deps, req);
    expect((await etaFor(g.deps, { ...req, kind: 'left' })).minutes).toBe(15);
    expect(g.requests).toHaveLength(2);
  });

  it('stops at 20 Routes calls per trip per day', async () => {
    const g = fakeRoutes([], { limit: 0 });
    expect(await etaFor(g.deps, req)).toEqual({ minutes: null, source: null, limited: true, routesCalls: 0 });
    expect(g.requests).toHaveLength(0);
    expect(DAILY_ROUTES_LIMIT).toBe(20);
  });

  it('saves a failure too, so the group does not pay for it again', async () => {
    const g = fakeRoutes([{ status: 403, body: { error: 'Routes API has not been used in project' } }]);
    const errors: unknown[] = [];
    expect(await etaFor(g.deps, req, (e) => errors.push(e))).toEqual({ minutes: null, source: null, limited: false, routesCalls: 1 });
    expect(String(errors[0])).toMatch(/403/);
    expect(await etaFor(g.deps, req)).toEqual({ minutes: null, source: null, limited: false, routesCalls: 0 });
    expect(g.requests).toHaveLength(1);
  });

  it('treats "no route found" as no answer', async () => {
    const g = fakeRoutes([{ body: {} }]);
    expect((await etaFor(g.deps, req)).minutes).toBeNull();
  });

  it('asks again once the saved answer is old', async () => {
    const g = fakeRoutes([route(600)]);
    g.cache.set(etaKey('funicular', 'before'), { at: NOW - 13 * 60 * MIN, minutes: 40 });
    expect((await etaFor(g.deps, req)).minutes).toBe(10);
  });
});
