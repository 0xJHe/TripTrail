// Google Weather API: current conditions and hourly forecast, with a cache in front.
// Shared by the weather Edge Function and the app (types + labels); plain TypeScript
// with no imports so Jest can test it with a fake fetch, cache, lock and counter.
//
// Credit rules:
// - Weather is cached per area (lat/lng rounded to 0.01°, about 1 km) for 30 minutes.
// - Only one request fetches an area at a time; the rest of the group waits and reads the saved result.
// - Max 30 weather calls per trip per day (its own counter, separate from Places).

export const WEATHER_URL = 'https://weather.googleapis.com/v1';
export const DAILY_WEATHER_LIMIT = 30;
export const WEATHER_FRESH_MINUTES = 30;
/** Hours of forecast fetched in one call (one page). */
export const FORECAST_HOURS = 24;
/** How long another phone waits for the one fetching the same area. */
export const WAIT_FOR_OTHER_MS = 4_000;
const WAIT_STEP_MS = 500;

/** Picks the icon. */
export type WeatherKind = 'sunny' | 'clear-night' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'storm' | 'snow' | 'wind';

export interface Weather {
  /** °C, rounded. */
  tempC: number;
  /** Lower case, e.g. "sunny", "partly cloudy", "light rain". */
  condition: string;
  kind: WeatherKind;
  /** km/h, rounded; null when Google didn't say. */
  windKmh: number | null;
  isDay: boolean;
  /** Chance of rain or snow, 0..100. */
  rainChance: number | null;
}

/** One hour of the forecast. */
export interface HourWeather extends Weather {
  /** ISO start / end of the hour. */
  start: string;
  end: string;
}

/** What the weather function replies. */
export interface WeatherReply {
  now: Weather | null;
  next: HourWeather | null;
  /** True if anything was left out because the trip's 30 weather calls today are used up. */
  limited: boolean;
  /** Real Google requests made for this reply. */
  weatherCalls: number;
}

export interface WeatherDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  apiKey: string;
  /** Count one weather call for this trip today. False when the daily limit is reached. */
  takeCall: () => Promise<boolean>;
  cacheGet: (key: string) => Promise<unknown | undefined>;
  cacheSet: (key: string, data: unknown) => Promise<void>;
  /** True = this request may fetch the key; false = another request is fetching it right now. */
  claim: (key: string) => Promise<boolean>;
  release: (key: string) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  /** Current time (ms). */
  now: () => number;
}

export interface WeatherLookup<T> {
  value: T | null;
  limited: boolean;
  calls: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** The ~1 km area a point is in: "5.40,100.27". */
export function areaOf(p: LatLng): string {
  return `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
}

/** Centre of the area, so every point in it asks Google the same question. */
function areaCentre(p: LatLng): LatLng {
  return { lat: Number(p.lat.toFixed(2)), lng: Number(p.lng.toFixed(2)) };
}

export const weatherKeys = {
  now: (p: LatLng) => `weather-now:${areaOf(p)}`,
  hours: (p: LatLng) => `weather-hours:${areaOf(p)}`,
};

/** Google's condition type -> our icon. */
export function weatherKind(type: string | undefined, isDay: boolean): WeatherKind {
  const t = (type ?? '').toUpperCase();
  if (t.includes('THUNDER')) return 'storm';
  if (t.includes('SNOW') || t.includes('HAIL')) return 'snow';
  if (t.includes('RAIN') || t.includes('SHOWER')) return 'rain';
  if (t.includes('FOG') || t.includes('HAZE') || t.includes('MIST')) return 'fog';
  if (t === 'WINDY') return 'wind';
  if (t === 'PARTLY_CLOUDY' || t === 'MOSTLY_CLEAR') return isDay ? 'partly' : 'clear-night';
  if (t === 'CLEAR') return isDay ? 'sunny' : 'clear-night';
  return 'cloudy';
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** One Google conditions block (current or one forecast hour) -> Weather. null if it has no temperature. */
export function toWeather(raw: any): Weather | null {
  const degrees = num(raw?.temperature?.degrees);
  if (degrees == null) return null;
  const tempC = raw.temperature.unit === 'FAHRENHEIT' ? ((degrees - 32) * 5) / 9 : degrees;
  const speed = num(raw?.wind?.speed?.value);
  const windKmh = speed == null ? null : raw.wind.speed.unit === 'MILES_PER_HOUR' ? speed * 1.609 : speed;
  const isDay = raw.isDaytime !== false;
  const type = raw?.weatherCondition?.type as string | undefined;
  const text = (raw?.weatherCondition?.description?.text as string | undefined)?.trim();
  const condition = (text || (type ?? 'unknown').replace(/_/g, ' ')).toLowerCase();
  return {
    tempC: Math.round(tempC),
    condition,
    kind: weatherKind(type, isDay),
    windKmh: windKmh == null ? null : Math.round(windKmh),
    isDay,
    rainChance: num(raw?.precipitation?.probability?.percent),
  };
}

async function get(deps: WeatherDeps, path: string, p: LatLng, extra = ''): Promise<any> {
  const c = areaCentre(p);
  const url =
    `${WEATHER_URL}/${path}?key=${encodeURIComponent(deps.apiKey)}` +
    `&location.latitude=${c.lat}&location.longitude=${c.lng}&unitsSystem=METRIC&languageCode=en${extra}`;
  const res = await deps.fetch(url);
  if (!res.ok) throw new Error(`Google Weather ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

type Saved<T> = { at: number; value: T | null };

function fresh<T>(deps: WeatherDeps, hit: unknown): hit is Saved<T> {
  const at = (hit as Saved<T> | undefined)?.at;
  return typeof at === 'number' && deps.now() - at < WEATHER_FRESH_MINUTES * 60_000;
}

/**
 * Saved result if it's under 30 minutes old. Otherwise one request fetches it
 * (counted, then saved for everyone) while any other request for the same area
 * waits a few seconds and reads what it saved.
 */
async function lookup<T>(deps: WeatherDeps, key: string, fetchIt: () => Promise<T | null>): Promise<WeatherLookup<T>> {
  const hit = await deps.cacheGet(key);
  if (fresh<T>(deps, hit)) return { value: hit.value, limited: false, calls: 0 };

  if (!(await deps.claim(key))) {
    for (let waited = 0; waited < WAIT_FOR_OTHER_MS; waited += WAIT_STEP_MS) {
      await deps.wait(WAIT_STEP_MS);
      const saved = await deps.cacheGet(key);
      if (fresh<T>(deps, saved)) return { value: saved.value, limited: false, calls: 0 };
    }
    return { value: null, limited: false, calls: 0 }; // the other phone is slow: skip this time
  }
  try {
    if (!(await deps.takeCall())) return { value: null, limited: true, calls: 0 };
    let value: T | null;
    try {
      value = await fetchIt();
    } catch (e) {
      // Save the failure too, so a broken key or outage isn't retried (and paid for) by every phone.
      await deps.cacheSet(key, { at: deps.now(), value: null } satisfies Saved<T>);
      throw e;
    }
    await deps.cacheSet(key, { at: deps.now(), value } satisfies Saved<T>);
    return { value, limited: false, calls: 1 };
  } finally {
    await deps.release(key);
  }
}

/** Weather right now in the point's area. 1 call (or 0 from the cache). */
export function currentWeather(deps: WeatherDeps, p: LatLng): Promise<WeatherLookup<Weather>> {
  return lookup(deps, weatherKeys.now(p), async () => toWeather(await get(deps, 'currentConditions:lookup', p)));
}

/** The next 24 hours in the point's area. 1 call (or 0 from the cache). */
export function hourlyForecast(deps: WeatherDeps, p: LatLng): Promise<WeatherLookup<HourWeather[]>> {
  return lookup(deps, weatherKeys.hours(p), async () => {
    const body = await get(deps, 'forecast/hours:lookup', p, `&hours=${FORECAST_HOURS}&pageSize=${FORECAST_HOURS}`);
    const hours: HourWeather[] = [];
    for (const h of (body?.forecastHours ?? []) as any[]) {
      const w = toWeather(h);
      const start = h?.interval?.startTime;
      const end = h?.interval?.endTime;
      if (w && typeof start === 'string' && typeof end === 'string') hours.push({ ...w, start, end });
    }
    return hours;
  });
}

/** The forecast hour that contains time t (ms), or null if the forecast doesn't reach it. */
export function hourAt(hours: HourWeather[], t: number): HourWeather | null {
  return hours.find((h) => Date.parse(h.start) <= t && t < Date.parse(h.end)) ?? null;
}

/**
 * Current weather at `now`, and the forecast at `next` in `inMinutes` (0 if its time has passed).
 * A failed part comes back null (the app hides that line); the other part still shows.
 */
export async function weatherFor(
  deps: WeatherDeps,
  req: { now: LatLng | null; next: (LatLng & { inMinutes: number }) | null },
  onError: (e: unknown) => void = () => {},
): Promise<WeatherReply> {
  const safe = <T>(p: Promise<WeatherLookup<T>>) =>
    p.catch((e): WeatherLookup<T> => {
      onError(e);
      return { value: null, limited: false, calls: 1 };
    });
  const [cur, hours] = await Promise.all([
    req.now ? safe(currentWeather(deps, req.now)) : null,
    req.next ? safe(hourlyForecast(deps, req.next)) : null,
  ]);
  const at = deps.now() + Math.max(0, req.next?.inMinutes ?? 0) * 60_000;
  return {
    now: cur?.value ?? null,
    next: hours?.value ? hourAt(hours.value, at) : null,
    limited: !!(cur?.limited || hours?.limited),
    weatherCalls: (cur?.calls ?? 0) + (hours?.calls ?? 0),
  };
}

/** "light breeze" etc. from km/h. */
export function windWords(kmh: number | null): string | null {
  if (kmh == null) return null;
  if (kmh < 6) return 'calm';
  if (kmh < 20) return 'light breeze';
  if (kmh < 39) return 'breezy';
  return 'windy';
}
