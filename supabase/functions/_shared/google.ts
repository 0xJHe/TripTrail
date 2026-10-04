// Google Places API (New) with a cache in front and a per-trip daily call limit.
// Shared by the Edge Functions; plain TypeScript with no imports so Jest can test
// it with a fake fetch, cache and counter.
//
// Credit rules: every request uses a field mask with only the fields we need,
// the cache is always checked first, and nothing is looked up twice.

export const PLACES_URL = 'https://places.googleapis.com/v1';
/** Max Google calls per trip per day, across all Edge Functions. */
export const DAILY_GOOGLE_LIMIT = 60;
export const PHOTO_MAX_WIDTH = 800;
export const MAX_SUGGESTIONS = 5;

/** Field masks: only what the app shows. No reviews, ratings or opening hours. */
export const FIELDS = {
  stop: 'places.id,places.displayName,places.formattedAddress,places.location',
  photo: 'places.id,places.photos',
  autocomplete: 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat',
  details: 'id,displayName,formattedAddress,location',
} as const;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlaceInfo {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
}

export interface PlacePhoto {
  placeId: string;
  url: string;
  /** Photographer name Google returns (must be shown on the photo). */
  credit: string | null;
  creditUrl: string | null;
}

export interface Suggestion {
  placeId: string;
  name: string;
  detail: string;
}

export interface GoogleDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  apiKey: string;
  /** Count one Google call for this trip today. False when the daily limit is reached. */
  takeCall: () => Promise<boolean>;
  cacheGet: (key: string) => Promise<unknown | undefined>;
  cacheSet: (key: string, kind: string, data: unknown) => Promise<void>;
}

/** What a lookup gave back; `limited` = skipped because the daily limit was reached. */
export interface Lookup<T> {
  value: T | null;
  limited: boolean;
  /** Real Google requests made. */
  calls: number;
}

/** Lower case, single spaces: the same words always hit the same cache row. */
export function normalizeKey(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

const nearKey = (near?: LatLng | null) => (near ? `@${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : '');

export const cacheKeys = {
  stop: (query: string, near?: LatLng | null) => `stop:${normalizeKey(query)}${nearKey(near)}`,
  photo: (landmark: string) => `photo:${normalizeKey(landmark)}`,
  autocomplete: (input: string, near?: LatLng | null) => `auto:${normalizeKey(input)}${nearKey(near)}`,
  details: (placeId: string) => `place:${placeId}`,
};

/** Distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function bias(near?: LatLng | null, radius = 30000) {
  return near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius } } } : {};
}

async function call(deps: GoogleDeps, url: string, fieldMask: string | null, body?: unknown): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Goog-Api-Key': deps.apiKey };
  if (fieldMask) headers['X-Goog-FieldMask'] = fieldMask;
  const res = await deps.fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

type Raw = { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } };

function toPlace(p: Raw | undefined): PlaceInfo | null {
  if (!p?.id || p.location?.latitude == null || p.location?.longitude == null) return null;
  return {
    placeId: p.id,
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? null,
    lat: p.location.latitude,
    lng: p.location.longitude,
  };
}

/** Cache first; else one or more Google calls (each counted); the result is cached, even "nothing found". */
async function cached<T>(
  deps: GoogleDeps,
  key: string,
  kind: string,
  calls: number,
  fetchIt: () => Promise<T | null>,
): Promise<Lookup<T>> {
  const hit = await deps.cacheGet(key);
  if (hit !== undefined) return { value: (hit as { value: T | null }).value, limited: false, calls: 0 };
  for (let i = 0; i < calls; i++) {
    if (!(await deps.takeCall())) return { value: null, limited: true, calls: i };
  }
  const value = await fetchIt();
  await deps.cacheSet(key, kind, { value });
  return { value, limited: false, calls };
}

/** Real address, location and place ID for a stop, e.g. "Kek Lok Si Temple, Penang". 1 call. */
export function findStopPlace(deps: GoogleDeps, query: string, near?: LatLng | null): Promise<Lookup<PlaceInfo>> {
  return cached(deps, cacheKeys.stop(query, near), 'stop', 1, async () => {
    const body = await call(deps, `${PLACES_URL}/places:searchText`, FIELDS.stop, { textQuery: query, pageSize: 1, ...bias(near) });
    return toPlace(body?.places?.[0]);
  });
}

/** One photo (max 800 px wide) of a landmark, with the photographer credit. 2 calls: search + photo URL. */
export async function findLandmarkPhoto(deps: GoogleDeps, landmark: string): Promise<Lookup<PlacePhoto>> {
  const key = cacheKeys.photo(landmark);
  const hit = await deps.cacheGet(key);
  if (hit !== undefined) return { value: (hit as { value: PlacePhoto | null }).value, limited: false, calls: 0 };
  if (!(await deps.takeCall())) return { value: null, limited: true, calls: 0 };
  const body = await call(deps, `${PLACES_URL}/places:searchText`, FIELDS.photo, { textQuery: landmark, pageSize: 1 });
  const place = body?.places?.[0];
  const photo = place?.photos?.[0];
  let value: PlacePhoto | null = null;
  let calls = 1;
  if (place?.id && photo?.name) {
    if (!(await deps.takeCall())) return { value: null, limited: true, calls };
    calls++;
    const media = await call(
      deps,
      `${PLACES_URL}/${photo.name}/media?maxWidthPx=${PHOTO_MAX_WIDTH}&skipHttpRedirect=true`,
      null, // the photo endpoint returns only { name, photoUri }
    );
    const author = photo.authorAttributions?.[0];
    if (media?.photoUri) {
      value = { placeId: place.id, url: media.photoUri, credit: author?.displayName ?? null, creditUrl: author?.uri ?? null };
    }
  }
  await deps.cacheSet(key, 'photo', { value });
  return { value, limited: false, calls };
}

/** Up to 5 place suggestions as the user types. Same session token until a place is picked. 1 call. */
export function autocomplete(
  deps: GoogleDeps,
  input: string,
  sessionToken: string,
  near?: LatLng | null,
): Promise<Lookup<Suggestion[]>> {
  return cached(deps, cacheKeys.autocomplete(input, near), 'autocomplete', 1, async () => {
    const body = await call(deps, `${PLACES_URL}/places:autocomplete`, FIELDS.autocomplete, {
      input,
      sessionToken,
      ...bias(near, 50000),
    });
    return ((body?.suggestions ?? []) as any[])
      .map((s) => s.placePrediction)
      .filter((p) => p?.placeId)
      .slice(0, MAX_SUGGESTIONS)
      .map((p) => ({
        placeId: p.placeId as string,
        name: (p.structuredFormat?.mainText?.text as string) ?? '',
        detail: (p.structuredFormat?.secondaryText?.text as string) ?? '',
      }));
  });
}

/** Address and location of a picked suggestion; ends the session. 1 call. */
export function placeDetails(deps: GoogleDeps, placeId: string, sessionToken: string): Promise<Lookup<PlaceInfo>> {
  return cached(deps, cacheKeys.details(placeId), 'place', 1, async () => {
    const token = encodeURIComponent(sessionToken);
    const body = await call(deps, `${PLACES_URL}/places/${encodeURIComponent(placeId)}?sessionToken=${token}`, FIELDS.details);
    return toPlace(body);
  });
}
