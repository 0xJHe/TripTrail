// Running late: the free travel estimate, the late rule, and Google Routes API with a
// cache in front. Shared by the eta Edge Function and the app; plain TypeScript with
// no imports so Jest can test it with a fake fetch, cache, lock and counter.
//
// Credit rules:
// - The app first estimates for free: straight line at 25 km/h. Google is only asked
//   when that estimate puts the group within 10 minutes of the start time, or later.
// - One Google answer per stop and check ("before" / "left"), saved for the whole
//   group: one phone asks, the others wait a moment and read what it saved.
// - Max 20 Routes calls per trip per day (its own counter).
// - Only the duration is asked for (field mask), without live traffic (cheapest SKU).

export const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
export const DAILY_ROUTES_LIMIT = 20;
/** Speed of the free straight-line estimate. */
export const ESTIMATE_KMH = 25;
/** Late = arriving more than this after the planned start. */
export const LATE_AFTER_MIN = 5;
/** Ask Google when the estimate arrives this close to the start time, or later. */
export const ASK_GOOGLE_WITHIN_MIN = 10;
/** The first check is about this long before the next stop starts. */
export const CHECK_BEFORE_MIN = 30;
/** Shorter than this (straight line): ask Google for a walking route. */
export const WALK_UNDER_M = 1200;
/** A saved answer is reused this long (a stop's check only happens on its day). */
export const ETA_FRESH_HOURS = 12;
/** How long another phone waits for the one asking Google about the same check. */
export const WAIT_FOR_OTHER_MS = 4_000;
const WAIT_STEP_MS = 500;
const MIN = 60_000;

/** "before" = ~30 min before the stop starts; "left" = when the group left the stop before. */
export type CheckKind = 'before' | 'left';

export interface LatLng {
  lat: number;
  lng: number;
}

/** What the eta function replies. */
export interface EtaReply {
  /** Travel minutes from Google; null = use the free estimate. */
  minutes: number | null;
  source: 'google' | null;
  /** True if Google was skipped because the trip's 20 Routes calls today are used up. */
  limited: boolean;
  /** Real Google requests made for this reply. */
  routesCalls: number;
}

export interface EtaDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  apiKey: string;
  /** Count one Routes call for this trip today. False when the daily limit is reached. */
  takeCall: () => Promise<boolean>;
  cacheGet: (key: string) => Promise<unknown | undefined>;
  cacheSet: (key: string, data: unknown) => Promise<void>;
  /** True = this request may ask Google; false = another request is asking right now. */
  claim: (key: string) => Promise<boolean>;
  release: (key: string) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  /** Current time (ms). */
  now: () => number;
}

/** Straight-line distance in metres. */
export function metersBetween(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Free travel estimate: straight line at 25 km/h, whole minutes (at least 1). */
export function estimateMinutes(from: LatLng, to: LatLng): number {
  return Math.max(1, Math.ceil((metersBetween(from, to) / 1000 / ESTIMATE_KMH) * 60));
}

/** The running-late rule: now + travel > planned start + 5 min. */
export function isLate(nowMs: number, travelMin: number, startMs: number): boolean {
  return nowMs + travelMin * MIN > startMs + LATE_AFTER_MIN * MIN;
}

/** Worth paying for Google: the free estimate arrives within 10 min of the start, or later. */
export function worthAskingGoogle(nowMs: number, estimateMin: number, startMs: number): boolean {
  return nowMs + estimateMin * MIN >= startMs - ASK_GOOGLE_WITHIN_MIN * MIN;
}

export const etaKey = (stopId: string, kind: CheckKind) => `eta:${stopId}:${kind}`;

/** Google's "1234s" -> seconds; null if it isn't one. */
export function parseDuration(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(text.trim());
  return m ? Number(m[1]) : null;
}

const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

/** One Routes API call: travel minutes from `from` to `to`, or null when Google finds no route. */
export async function routeMinutes(deps: EtaDeps, from: LatLng, to: LatLng): Promise<number | null> {
  const walk = metersBetween(from, to) < WALK_UNDER_M;
  const res = await deps.fetch(ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': deps.apiKey,
      'X-Goog-FieldMask': 'routes.duration',
    },
    body: JSON.stringify({
      origin: point(from),
      destination: point(to),
      ...(walk ? { travelMode: 'WALK' } : { travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' }),
    }),
  });
  if (!res.ok) throw new Error(`Google Routes ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const seconds = parseDuration(body?.routes?.[0]?.duration);
  return seconds == null ? null : Math.max(1, Math.ceil(seconds / 60));
}

type Saved = { at: number; minutes: number | null };

function fresh(deps: EtaDeps, hit: unknown): hit is Saved {
  const at = (hit as Saved | undefined)?.at;
  return typeof at === 'number' && deps.now() - at < ETA_FRESH_HOURS * 60 * MIN;
}

const none = (limited = false, routesCalls = 0): EtaReply => ({ minutes: null, source: null, limited, routesCalls });
const found = (minutes: number | null, routesCalls: number): EtaReply =>
  minutes == null ? none(false, routesCalls) : { minutes, source: 'google', limited: false, routesCalls };

/**
 * Real travel time for one check of one stop. Saved answer first; otherwise one request
 * asks Google (counted, then saved for everyone) while any other request for the same
 * check waits a few seconds and reads what it saved. Never throws: on a failure the
 * reply has minutes null and the app keeps its free estimate.
 */
export async function etaFor(
  deps: EtaDeps,
  req: { stopId: string; kind: CheckKind; from: LatLng; to: LatLng },
  onError: (e: unknown) => void = () => {},
): Promise<EtaReply> {
  const key = etaKey(req.stopId, req.kind);
  try {
    const hit = await deps.cacheGet(key);
    if (fresh(deps, hit)) return found(hit.minutes, 0);

    if (!(await deps.claim(key))) {
      for (let waited = 0; waited < WAIT_FOR_OTHER_MS; waited += WAIT_STEP_MS) {
        await deps.wait(WAIT_STEP_MS);
        const saved = await deps.cacheGet(key);
        if (fresh(deps, saved)) return found(saved.minutes, 0);
      }
      return none(); // the other phone is slow: use the free estimate this time
    }
    try {
      if (!(await deps.takeCall())) return none(true);
      let minutes: number | null;
      try {
        minutes = await routeMinutes(deps, req.from, req.to);
      } catch (e) {
        // Save the failure too, so a broken key or outage isn't retried (and paid for) by every phone.
        await deps.cacheSet(key, { at: deps.now(), minutes: null } satisfies Saved);
        onError(e);
        return none(false, 1);
      }
      await deps.cacheSet(key, { at: deps.now(), minutes } satisfies Saved);
      return found(minutes, 1);
    } finally {
      await deps.release(key);
    }
  } catch (e) {
    onError(e);
    return none();
  }
}
