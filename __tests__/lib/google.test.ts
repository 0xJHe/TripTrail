// Google Places client with a fake fetch, cache and daily counter. No real Google calls.
import {
  autocomplete,
  cacheKeys,
  FIELDS,
  findLandmarkPhoto,
  findStopPlace,
  placeDetails,
  refreshPlacePhoto,
  type GoogleDeps,
} from '@/supabase/functions/_shared/google';

type Reply = { status?: number; body: unknown };

function fakeGoogle(replies: Reply[], limit = 60) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const cache = new Map<string, unknown>();
  let used = 0;
  const deps: GoogleDeps = {
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
    takeCall: async () => (used < limit ? (used++, true) : false),
    cacheGet: async (key) => cache.get(key),
    cacheSet: async (key, _kind, data) => {
      cache.set(key, data);
    },
  };
  return { deps, requests, cache, used: () => used };
}

const header = (r: { init?: RequestInit }, name: string) => (r.init?.headers as Record<string, string>)[name];

const kekLokSi = {
  id: 'ChIJkek',
  displayName: { text: 'Kek Lok Si Temple' },
  formattedAddress: 'Air Itam, 11500 Penang',
  location: { latitude: 5.3998, longitude: 100.2737 },
};

describe('field masks', () => {
  it('only ask for what the app shows (no reviews, ratings or opening hours)', () => {
    expect(FIELDS.stop).toBe('places.id,places.displayName,places.formattedAddress,places.location');
    expect(FIELDS.photo).toBe('places.id,places.photos');
    for (const mask of Object.values(FIELDS)) expect(mask).not.toMatch(/review|rating|openingHours|hours/i);
  });
});

describe('findStopPlace', () => {
  it('finds the address, location and place ID with the stop field mask', async () => {
    const g = fakeGoogle([{ body: { places: [kekLokSi] } }]);
    const found = await findStopPlace(g.deps, 'Kek Lok Si Temple, Penang', { lat: 5.4, lng: 100.27 });
    expect(found).toEqual({
      value: { placeId: 'ChIJkek', name: 'Kek Lok Si Temple', address: 'Air Itam, 11500 Penang', lat: 5.3998, lng: 100.2737 },
      limited: false,
      calls: 1,
    });
    expect(g.requests[0].url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(header(g.requests[0], 'X-Goog-FieldMask')).toBe(FIELDS.stop);
    expect(JSON.parse(g.requests[0].init!.body as string)).toMatchObject({ textQuery: 'Kek Lok Si Temple, Penang', pageSize: 1 });
  });

  it('checks the cache first and never looks the same stop up twice', async () => {
    const g = fakeGoogle([{ body: { places: [kekLokSi] } }]);
    await findStopPlace(g.deps, 'Kek Lok Si Temple, Penang');
    const again = await findStopPlace(g.deps, '  kek lok si TEMPLE,  penang ');
    expect(again.calls).toBe(0);
    expect(again.value?.placeId).toBe('ChIJkek');
    expect(g.requests).toHaveLength(1);
    expect(g.used()).toBe(1);
  });

  it('caches "nothing found" too', async () => {
    const g = fakeGoogle([{ body: {} }]);
    expect((await findStopPlace(g.deps, 'Nowhere at all')).value).toBeNull();
    expect((await findStopPlace(g.deps, 'Nowhere at all')).calls).toBe(0);
    expect(g.cache.get(cacheKeys.stop('Nowhere at all'))).toEqual({ value: null });
  });

  it('does not call Google once the daily limit is reached', async () => {
    const g = fakeGoogle([], 0);
    expect(await findStopPlace(g.deps, 'Penang Hill')).toEqual({ value: null, limited: true, calls: 0 });
    expect(g.requests).toHaveLength(0);
  });

  it('throws on a Google error without caching it', async () => {
    const g = fakeGoogle([{ status: 403, body: { error: 'API not enabled' } }]);
    await expect(findStopPlace(g.deps, 'Penang Hill')).rejects.toThrow('Google 403');
    expect(g.cache.size).toBe(0);
  });
});

describe('findLandmarkPhoto', () => {
  const photoPlace = {
    id: 'ChIJwat',
    photos: [
      { name: 'places/ChIJwat/photos/abc', authorAttributions: [{ displayName: 'Ana Lim', uri: 'https://maps.google.com/ana' }] },
      { name: 'places/ChIJwat/photos/def', authorAttributions: [] },
    ],
  };

  it('gets one photo at most 800 px wide, with the photographer credit', async () => {
    const g = fakeGoogle([{ body: { places: [photoPlace] } }, { body: { photoUri: 'https://lh3.example/wat.jpg' } }]);
    const found = await findLandmarkPhoto(g.deps, 'Wat Arun, Bangkok');
    expect(found).toEqual({
      value: { placeId: 'ChIJwat', url: 'https://lh3.example/wat.jpg', credit: 'Ana Lim', creditUrl: 'https://maps.google.com/ana' },
      limited: false,
      calls: 2,
    });
    expect(header(g.requests[0], 'X-Goog-FieldMask')).toBe(FIELDS.photo);
    expect(g.requests[1].url).toBe(
      'https://places.googleapis.com/v1/places/ChIJwat/photos/abc/media?maxWidthPx=800&skipHttpRedirect=true',
    );
  });

  it('keeps the photo URL in the cache', async () => {
    const g = fakeGoogle([{ body: { places: [photoPlace] } }, { body: { photoUri: 'https://lh3.example/wat.jpg' } }]);
    await findLandmarkPhoto(g.deps, 'Wat Arun, Bangkok');
    const again = await findLandmarkPhoto(g.deps, 'Wat Arun, Bangkok');
    expect(again.calls).toBe(0);
    expect(again.value?.url).toBe('https://lh3.example/wat.jpg');
    expect(g.requests).toHaveLength(2);
  });

  it('caches a landmark with no photo as null (the card keeps its drawing)', async () => {
    const g = fakeGoogle([{ body: { places: [{ id: 'x', photos: [] }] } }]);
    expect((await findLandmarkPhoto(g.deps, 'Tiny shrine')).value).toBeNull();
    expect((await findLandmarkPhoto(g.deps, 'Tiny shrine')).calls).toBe(0);
  });

  it('stops when the limit is reached between the search and the photo', async () => {
    const g = fakeGoogle([{ body: { places: [photoPlace] } }], 1);
    expect(await findLandmarkPhoto(g.deps, 'Wat Arun, Bangkok')).toEqual({ value: null, limited: true, calls: 1 });
  });
});

describe('Add a stop search', () => {
  const suggestion = (n: number) => ({
    placePrediction: {
      placeId: `id${n}`,
      structuredFormat: { mainText: { text: `Place ${n}` }, secondaryText: { text: 'George Town, Penang' } },
    },
  });

  it('returns at most 5 suggestions and sends the session token', async () => {
    const g = fakeGoogle([{ body: { suggestions: [1, 2, 3, 4, 5, 6].map(suggestion) } }]);
    const found = await autocomplete(g.deps, 'chew jetty', 'session-1', { lat: 5.41, lng: 100.33 });
    expect(found.value).toHaveLength(5);
    expect(found.value?.[0]).toEqual({ placeId: 'id1', name: 'Place 1', detail: 'George Town, Penang' });
    const body = JSON.parse(g.requests[0].init!.body as string);
    expect(body).toMatchObject({ input: 'chew jetty', sessionToken: 'session-1' });
    expect(body.locationBias.circle.center).toEqual({ latitude: 5.41, longitude: 100.33 });
    expect(header(g.requests[0], 'X-Goog-FieldMask')).toBe(FIELDS.autocomplete);
  });

  it('gets the picked place with the same session token and the details field mask', async () => {
    const g = fakeGoogle([{ body: kekLokSi }]);
    const found = await placeDetails(g.deps, 'ChIJkek', 'session-1');
    expect(found.value?.address).toBe('Air Itam, 11500 Penang');
    expect(g.requests[0].url).toBe('https://places.googleapis.com/v1/places/ChIJkek?sessionToken=session-1');
    expect(header(g.requests[0], 'X-Goog-FieldMask')).toBe(FIELDS.details);
    expect((await placeDetails(g.deps, 'ChIJkek', 'session-2')).calls).toBe(0);
  });
});

describe('refreshPlacePhoto', () => {
  const place = {
    id: 'ChIJwat',
    photos: [{ name: 'places/ChIJwat/photos/new', authorAttributions: [{ displayName: 'Ana Lim', uri: 'https://maps.google.com/ana' }] }],
  };
  const t0 = Date.UTC(2026, 9, 5, 10, 0);

  it('gets a new link from the saved place ID, counting both calls', async () => {
    const g = fakeGoogle([{ body: place }, { body: { photoUri: 'https://lh3.example/wat-new.jpg' } }]);
    // An old, expired link in the landmark cache is not used.
    g.cache.set(cacheKeys.photo('Wat Arun, Bangkok'), { value: { placeId: 'ChIJwat', url: 'https://lh3.example/old.jpg' } });
    const found = await refreshPlacePhoto(g.deps, 'ChIJwat', t0);
    expect(found).toEqual({
      value: { placeId: 'ChIJwat', url: 'https://lh3.example/wat-new.jpg', credit: 'Ana Lim', creditUrl: 'https://maps.google.com/ana' },
      limited: false,
      calls: 2,
    });
    expect(g.used()).toBe(2);
    expect(g.requests[0].url).toBe('https://places.googleapis.com/v1/places/ChIJwat');
    expect(header(g.requests[0], 'X-Goog-FieldMask')).toBe('id,photos');
    expect(g.requests[1].url).toBe(
      'https://places.googleapis.com/v1/places/ChIJwat/photos/new/media?maxWidthPx=800&skipHttpRedirect=true',
    );
  });

  it('reuses a fresh link for 30 minutes, then asks again', async () => {
    const g = fakeGoogle([
      { body: place },
      { body: { photoUri: 'https://lh3.example/a.jpg' } },
      { body: place },
      { body: { photoUri: 'https://lh3.example/b.jpg' } },
    ]);
    await refreshPlacePhoto(g.deps, 'ChIJwat', t0);
    const soon = await refreshPlacePhoto(g.deps, 'ChIJwat', t0 + 29 * 60_000);
    expect(soon).toMatchObject({ calls: 0, value: { url: 'https://lh3.example/a.jpg' } });
    const later = await refreshPlacePhoto(g.deps, 'ChIJwat', t0 + 31 * 60_000);
    expect(later).toMatchObject({ calls: 2, value: { url: 'https://lh3.example/b.jpg' } });
  });

  it('makes no Google call once the trip has used its 60 calls today', async () => {
    const g = fakeGoogle([], 0);
    expect(await refreshPlacePhoto(g.deps, 'ChIJwat', t0)).toEqual({ value: null, limited: true, calls: 0 });
    expect(g.requests).toHaveLength(0);
  });

  it('stops when the limit is reached between the details and the photo', async () => {
    const g = fakeGoogle([{ body: place }], 1);
    expect(await refreshPlacePhoto(g.deps, 'ChIJwat', t0)).toEqual({ value: null, limited: true, calls: 1 });
  });

  it('gives null when the place has no photos any more', async () => {
    const g = fakeGoogle([{ body: { id: 'ChIJwat', photos: [] } }]);
    expect(await refreshPlacePhoto(g.deps, 'ChIJwat', t0)).toEqual({ value: null, limited: false, calls: 1 });
  });

  it('throws on a Google error (the function then answers with an error)', async () => {
    const g = fakeGoogle([{ status: 403, body: { error: 'denied' } }]);
    await expect(refreshPlacePhoto(g.deps, 'ChIJwat', t0)).rejects.toThrow('Google 403');
  });
});
