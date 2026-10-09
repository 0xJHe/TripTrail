// Google Weather client with a fake fetch, cache, lock and daily counter. No real Google calls.
import {
  areaOf,
  DAILY_WEATHER_LIMIT,
  hourAt,
  hoursBetween,
  rainWithin,
  toWeather,
  weatherFor,
  weatherKeys,
  weatherKind,
  windWords,
  type WeatherDeps,
} from '@/supabase/functions/_shared/weather';

const MIN = 60_000;
const NOON = Date.parse('2026-10-12T04:00:00Z'); // 12:00 in Penang

const kekLokSi = { lat: 5.39994, lng: 100.27382 };
const nearby = { lat: 5.40221, lng: 100.27011 }; // ~480 m away, same 0.01° area
const chulia = { lat: 5.41722, lng: 100.33641 };

const sunny = {
  currentTime: '2026-10-12T04:00:00Z',
  isDaytime: true,
  weatherCondition: { description: { text: 'Sunny', languageCode: 'en' }, type: 'CLEAR' },
  temperature: { degrees: 31.6, unit: 'CELSIUS' },
  wind: { speed: { value: 9, unit: 'KILOMETERS_PER_HOUR' } },
  precipitation: { probability: { percent: 10, type: 'RAIN' } },
};

function hour(startIso: string, text: string, type: string, degrees: number) {
  const start = Date.parse(startIso);
  return {
    interval: { startTime: startIso, endTime: new Date(start + 60 * MIN).toISOString() },
    isDaytime: true,
    weatherCondition: { description: { text, languageCode: 'en' }, type },
    temperature: { degrees, unit: 'CELSIUS' },
    wind: { speed: { value: 4, unit: 'KILOMETERS_PER_HOUR' } },
    precipitation: { probability: { percent: 40, type: 'RAIN' } },
  };
}

const forecast = {
  forecastHours: [
    hour('2026-10-12T04:00:00Z', 'Sunny', 'CLEAR', 32),
    hour('2026-10-12T05:00:00Z', 'Partly cloudy', 'PARTLY_CLOUDY', 31),
    hour('2026-10-12T06:00:00Z', 'Cloudy', 'CLOUDY', 29),
    hour('2026-10-12T07:00:00Z', 'Light rain', 'LIGHT_RAIN', 27),
  ],
};

type Reply = { status?: number; body: unknown };

function fakeWeather(replies: Reply[], opts: { limit?: number; locked?: string[] } = {}) {
  const requests: string[] = [];
  const cache = new Map<string, unknown>();
  const locks = new Set<string>(opts.locked ?? []);
  let used = 0;
  let clock = NOON;
  const deps: WeatherDeps = {
    apiKey: 'test-key',
    fetch: async (url) => {
      requests.push(url);
      const reply = replies.shift();
      if (!reply) throw new Error(`unexpected Google request: ${url}`);
      return {
        ok: (reply.status ?? 200) < 400,
        status: reply.status ?? 200,
        json: async () => reply.body,
        text: async () => JSON.stringify(reply.body),
      } as Response;
    },
    takeCall: async () => (used < (opts.limit ?? DAILY_WEATHER_LIMIT) ? (used++, true) : false),
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
    wait: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
  return {
    deps,
    requests,
    cache,
    locks,
    used: () => used,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

describe('weatherFor', () => {
  it('current weather at the stop and the forecast for the next stop at its start time', async () => {
    const g = fakeWeather([{ body: sunny }, { body: forecast }]);
    const reply = await weatherFor(g.deps, { now: kekLokSi, next: { ...chulia, inMinutes: 120 } });
    expect(reply.now).toEqual({ tempC: 32, condition: 'sunny', kind: 'sunny', windKmh: 9, isDay: true, rainChance: 10 });
    expect(reply.next).toMatchObject({ tempC: 29, condition: 'cloudy', kind: 'cloudy', start: '2026-10-12T06:00:00Z' });
    expect(reply).toMatchObject({ limited: false, weatherCalls: 2 });
  });

  it('asks Google for the centre of the ~1 km area, in metric, with the key', async () => {
    const g = fakeWeather([{ body: sunny }, { body: forecast }]);
    await weatherFor(g.deps, { now: kekLokSi, next: { ...chulia, inMinutes: 0 } });
    const [cur, hours] = g.requests;
    expect(cur).toContain('https://weather.googleapis.com/v1/currentConditions:lookup?key=test-key');
    expect(cur).toContain('location.latitude=5.4&location.longitude=100.27');
    expect(cur).toContain('unitsSystem=METRIC');
    expect(hours).toContain('https://weather.googleapis.com/v1/forecast/hours:lookup?');
    expect(hours).toContain('location.latitude=5.42&location.longitude=100.34');
    expect(hours).toContain('hours=24');
  });

  it('a point in the same area within 30 min reads the saved result: no Google call', async () => {
    const g = fakeWeather([{ body: sunny }]);
    await weatherFor(g.deps, { now: kekLokSi, next: null });
    g.tick(29 * MIN);
    const again = await weatherFor(g.deps, { now: nearby, next: null });
    expect(again.now?.tempC).toBe(32);
    expect(again.weatherCalls).toBe(0);
    expect(g.requests).toHaveLength(1);
    expect(g.used()).toBe(1);
  });

  it('after 30 minutes it fetches again', async () => {
    const g = fakeWeather([{ body: sunny }, { body: { ...sunny, temperature: { degrees: 30, unit: 'CELSIUS' } } }]);
    await weatherFor(g.deps, { now: kekLokSi, next: null });
    g.tick(31 * MIN);
    const later = await weatherFor(g.deps, { now: kekLokSi, next: null });
    expect(later.now?.tempC).toBe(30);
    expect(later.weatherCalls).toBe(1);
  });

  it('one forecast call answers any hour in the next day for that area', async () => {
    const g = fakeWeather([{ body: forecast }]);
    const a = await weatherFor(g.deps, { now: null, next: { ...chulia, inMinutes: 60 } });
    const b = await weatherFor(g.deps, { now: null, next: { ...chulia, inMinutes: 190 } });
    expect(a.next?.condition).toBe('partly cloudy');
    expect(b.next?.condition).toBe('light rain');
    expect(b.next?.kind).toBe('rain');
    expect(g.requests).toHaveLength(1);
  });

  it('a stop whose time has passed gets the current hour; beyond the forecast gets nothing', async () => {
    const g = fakeWeather([{ body: forecast }]);
    expect((await weatherFor(g.deps, { now: null, next: { ...chulia, inMinutes: -40 } })).next?.condition).toBe('sunny');
    expect((await weatherFor(g.deps, { now: null, next: { ...chulia, inMinutes: 600 } })).next).toBeNull();
  });

  it('stops at the daily limit: nothing fetched, limited = true', async () => {
    const g = fakeWeather([{ body: sunny }], { limit: 1 });
    await weatherFor(g.deps, { now: kekLokSi, next: null });
    const reply = await weatherFor(g.deps, { now: chulia, next: { ...chulia, inMinutes: 0 } });
    expect(reply).toEqual({ now: null, next: null, soon: [], limited: true, weatherCalls: 0 });
    expect(g.requests).toHaveLength(1);
  });

  it('while another phone is fetching the area, waits and reads what it saved (no second call)', async () => {
    const g = fakeWeather([], { locked: [weatherKeys.now(kekLokSi)] });
    // The other phone saves its result while this one waits.
    const realWait = g.deps.wait;
    let waits = 0;
    g.deps.wait = async (ms) => {
      waits += 1;
      if (waits === 2) g.cache.set(weatherKeys.now(kekLokSi), { at: g.deps.now(), value: toWeather(sunny) });
      await realWait(ms);
    };
    const reply = await weatherFor(g.deps, { now: kekLokSi, next: null });
    expect(reply.now?.condition).toBe('sunny');
    expect(reply.weatherCalls).toBe(0);
    expect(g.used()).toBe(0);
    expect(g.requests).toHaveLength(0);
  });

  it('gives up after a few seconds if the other phone never saves, without calling Google', async () => {
    const g = fakeWeather([], { locked: [weatherKeys.now(kekLokSi)] });
    const reply = await weatherFor(g.deps, { now: kekLokSi, next: null });
    expect(reply.now).toBeNull();
    expect(g.requests).toHaveLength(0);
  });

  it('a Google error hides only that part, is saved for 30 min, and releases the lock', async () => {
    const errors: unknown[] = [];
    const g = fakeWeather([{ status: 403, body: { error: 'Weather API not enabled' } }, { body: forecast }]);
    const reply = await weatherFor(g.deps, { now: kekLokSi, next: { ...chulia, inMinutes: 0 } }, (e) => errors.push(e));
    expect(reply.now).toBeNull();
    expect(reply.next?.condition).toBe('sunny');
    expect(errors).toHaveLength(1);
    expect(g.locks.size).toBe(0);
    // Not retried (and not paid for again) within 30 minutes.
    const again = await weatherFor(g.deps, { now: kekLokSi, next: null });
    expect(again.now).toBeNull();
    expect(g.requests).toHaveLength(2);
  });

  it('a reply without a temperature is no weather (never crashes)', async () => {
    const g = fakeWeather([{ body: { weatherCondition: { type: 'CLEAR' } } }]);
    expect((await weatherFor(g.deps, { now: kekLokSi, next: null })).now).toBeNull();
  });
});

describe('helpers', () => {
  it('areaOf rounds to about 1 km', () => {
    expect(areaOf(kekLokSi)).toBe('5.40,100.27');
    expect(areaOf(nearby)).toBe(areaOf(kekLokSi));
    expect(areaOf(chulia)).not.toBe(areaOf(kekLokSi));
  });

  it('weatherKind maps Google types to icons', () => {
    expect(weatherKind('CLEAR', true)).toBe('sunny');
    expect(weatherKind('CLEAR', false)).toBe('clear-night');
    expect(weatherKind('MOSTLY_CLOUDY', true)).toBe('cloudy');
    expect(weatherKind('SCATTERED_SHOWERS', true)).toBe('rain');
    expect(weatherKind('HEAVY_THUNDERSTORM', true)).toBe('storm');
    expect(weatherKind(undefined, true)).toBe('cloudy');
  });

  it('toWeather converts °F and mph', () => {
    const w = toWeather({ temperature: { degrees: 86, unit: 'FAHRENHEIT' }, wind: { speed: { value: 10, unit: 'MILES_PER_HOUR' } } });
    expect(w).toMatchObject({ tempC: 30, windKmh: 16, condition: 'unknown' });
  });

  it('hourAt finds the hour containing the time', () => {
    const hours = forecast.forecastHours.map((h) => ({ ...toWeather(h)!, start: h.interval.startTime, end: h.interval.endTime }));
    expect(hourAt(hours, NOON + 90 * MIN)?.condition).toBe('partly cloudy');
    expect(hourAt(hours, NOON - MIN)).toBeNull();
  });

  it('windWords', () => {
    expect(windWords(3)).toBe('calm');
    expect(windWords(9)).toBe('light breeze');
    expect(windWords(25)).toBe('breezy');
    expect(windWords(50)).toBe('windy');
    expect(windWords(null)).toBeNull();
  });
});

describe('rain within the hour (rain backup, no extra weather call)', () => {
  const cloudy = toWeather({ ...sunny, weatherCondition: { type: 'CLOUDY' } })!;
  const raining = toWeather({ ...sunny, weatherCondition: { type: 'LIGHT_RAIN' } })!;
  const hours = forecast.forecastHours.map((h) => ({ ...toWeather(h)!, start: h.interval.startTime, end: h.interval.endTime }));

  it('the weather reply carries the next 2 hours of the forecast it already fetched', async () => {
    const g = fakeWeather([{ body: sunny }, { body: forecast }]);
    const reply = await weatherFor(g.deps, { now: kekLokSi, next: { ...chulia, inMinutes: 120 } });
    expect(reply.soon?.map((h) => h.start)).toEqual(['2026-10-12T04:00:00Z', '2026-10-12T05:00:00Z']);
    expect(reply.weatherCalls).toBe(2);
  });

  it('raining now = 0 min; else the start of the first wet hour within 60 min', () => {
    expect(rainWithin(raining, [], NOON)).toBe(0);
    // 06:20 Penang time (UTC 06:20): light rain from 07:00 UTC hour = in 40 min.
    expect(rainWithin(cloudy, hours, Date.parse('2026-10-12T06:20:00Z'))).toBe(40);
    // 05:30: the rain hour starts in 90 min, too far.
    expect(rainWithin(cloudy, hours, Date.parse('2026-10-12T05:30:00Z'))).toBeNull();
  });

  it('a 50%+ chance of rain counts; 40% does not', () => {
    const t = Date.parse('2026-10-12T04:30:00Z');
    expect(rainWithin(cloudy, hours.slice(0, 2), t)).toBeNull();
    const wetter = hours.map((h, i) => (i === 1 ? { ...h, rainChance: 60 } : h));
    expect(rainWithin(cloudy, wetter, t)).toBe(30);
  });

  it('hoursBetween keeps the hours overlapping the window', () => {
    const t = Date.parse('2026-10-12T04:30:00Z');
    expect(hoursBetween(hours, t, t + 60 * MIN).map((h) => h.start)).toEqual(['2026-10-12T04:00:00Z', '2026-10-12T05:00:00Z']);
  });
});
