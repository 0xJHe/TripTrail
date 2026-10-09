// Running early: one nearby place to fill the spare time before the next stop, from
// Google Places API (New) Nearby Search, picked with simple rules (no AI). Shared by the
// nearby-suggestion Edge Function and the app; plain TypeScript with no imports so Jest
// can test it with a fake fetch, cache, lock and counter.
//
// Credit rules:
// - Field mask: place ID, name, location and types only.
// - Places are cached per ~500 m area (and radius and type list) for 1 hour, for every
//   trip; an empty or failed answer only for 10 minutes.
// - At most 2 searches per stop: 1 km for the must-haves; only if nothing there is usable,
//   2 km for the must-haves plus a few that suit anyone (park, museum, sight, café).
// - Max 10 nearby searches per trip per day (its own counter).
// - One pick per stop, saved for the whole group: one phone asks, the others wait a
//   moment and read what it saved.
//
// Rain backup (prototype screen 10) uses the same search, caches, lock and daily counter
// (rainOptionsFor): up to 3 indoor places for an outdoor stop, with indoor types only.

export const NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
export const NEARBY_FIELDS = 'places.id,places.displayName,places.location,places.types';
export const DAILY_NEARBY_LIMIT = 10;
/** First search this far around the group... */
export const NEARBY_RADIUS_M = 1000;
/** ...then once more this far if nothing there was usable. */
export const WIDER_RADIUS_M = 2000;
/** Places asked for per search. */
export const NEARBY_MAX_RESULTS = 5;
/** Area size for the cache: 0.005° ≈ 550 m. */
const AREA_STEP = 0.005;
/** A cached area (and a stop's pick) is reused this long... */
export const NEARBY_FRESH_MIN = 60;
/** ...but an empty or failed one only this long, so it's tried again soon. */
export const EMPTY_FRESH_MIN = 10;
/** How long another phone waits for the one asking Google about the same stop. */
export const WAIT_FOR_OTHER_MS = 4_000;
const WAIT_STEP_MS = 500;

/** The added stop lasts at most this long... */
export const MAX_FILL_MIN = 60;
/** ...and a place is only suggested if there is at least this long to spend there. */
export const MIN_FILL_MIN = 20;
/** Walking pace (~4.8 km/h). */
export const WALK_M_PER_MIN = 80;
/** Further than this, a leg is a ride at the running-late estimate speed (25 km/h) instead. */
export const WALK_UNDER_M = 1200;
const RIDE_KMH = 25;
const MIN = 60_000;

export interface LatLng {
  lat: number;
  lng: number;
}

/** A place from Nearby Search (only the fields we pay for). */
export interface NearbyPlace extends LatLng {
  placeId: string;
  name: string;
  types: string[];
}

/** The one suggestion on the early card. */
export interface NearbySuggestion extends LatLng {
  placeId: string;
  name: string;
  /** "Café", "Museum", "Park"... */
  kind: string;
  category: 'food' | 'sight' | 'shopping';
  outdoor: boolean;
  /** Straight line from the group, metres. */
  distanceM: number;
  walkMin: number;
  /** Rough price per person, RM (an estimate from the place type). */
  price: number;
  /** null = nobody gave a budget. */
  withinBudget: boolean | null;
  /** Why it was picked, e.g. "Café 400 m away · matches your 'cafés' must-have". */
  reason: string;
  /** Food place and someone needs halal: show "Halal-friendly · not verified". */
  halalNote: boolean;
}

/** What the group wants, from everyone's preferences. */
export interface GroupPrefs {
  /** Every member's must-haves, most chosen first. */
  mustHaves: string[];
  foodNeeds: string[];
  noGos: string[];
  /** RM per person left in today's budget (lowest daily budget − today's stops); null = no budget. */
  budgetLeft: number | null;
}

export interface NearbyRequest {
  /** The stop the group is heading to (one pick per stop). */
  stopId: string;
  /** Where the group is. */
  from: LatLng;
  /** The next stop. */
  next: LatLng & { isFood: boolean };
  /** Spare minutes before the next stop (shared spare-time rule). */
  spareMin: number;
  /** Time of day on the phone's clock (minutes since midnight; the fake time in Demo mode). */
  localMinutes: number;
  /** Already in the plan: never suggested again. */
  planned: { placeIds: string[]; names: string[] };
  prefs: GroupPrefs;
}

export interface NearbyReply {
  /** null = nothing fits (or Google failed): "Enjoy the extra time". */
  suggestion: NearbySuggestion | null;
  /** True if the search was skipped because today's 10 searches are used up. */
  limited: boolean;
  /** Real Google requests made for this reply. */
  placesCalls: number;
}

export interface NearbyDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  apiKey: string;
  /** Count one nearby search for this trip today. False when the daily limit is reached. */
  takeCall: () => Promise<boolean>;
  cacheGet: (key: string) => Promise<unknown | undefined>;
  cacheSet: (key: string, data: unknown) => Promise<void>;
  /** True = this request may ask Google; false = another request is asking right now. */
  claim: (key: string) => Promise<boolean>;
  release: (key: string) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  /** Current real time (ms), for cache freshness. */
  now: () => number;
}

// ---------- Place kinds ----------

interface Kind {
  types: string[];
  label: string;
  /** Rough price per person, RM. */
  price: number;
  category: NearbySuggestion['category'];
  /** meal = only near a meal time; snack = any time. Both count as food (halal label). */
  food?: 'meal' | 'snack';
  outdoor?: boolean;
  /** Must-haves (from the preferences screen) this kind matches. */
  mustHaves: string[];
}

/** Most specific first: a place gets the first kind whose types it has. */
export const KINDS: Kind[] = [
  { types: ['cafe', 'coffee_shop'], label: 'Café', price: 15, category: 'food', food: 'snack', mustHaves: ['Cafés'] },
  { types: ['bakery'], label: 'Bakery', price: 10, category: 'food', food: 'snack', mustHaves: ['Cafés'] },
  { types: ['museum'], label: 'Museum', price: 10, category: 'sight', mustHaves: ['Museums', 'Famous sights'] },
  { types: ['art_gallery'], label: 'Gallery', price: 10, category: 'sight', mustHaves: ['Museums'] },
  { types: ['park'], label: 'Park', price: 0, category: 'sight', outdoor: true, mustHaves: ['Nature'] },
  { types: ['shopping_mall'], label: 'Mall', price: 0, category: 'shopping', mustHaves: ['Shopping'] },
  { types: ['tourist_attraction'], label: 'Sight', price: 10, category: 'sight', mustHaves: ['Famous sights'] },
  {
    types: ['vegetarian_restaurant', 'vegan_restaurant', 'restaurant'],
    label: 'Restaurant',
    price: 20,
    category: 'food',
    food: 'meal',
    mustHaves: ['Street food'],
  },
  // Only searched for the rain backup (no must-have maps to them, so running early never asks for them).
  { types: ['aquarium'], label: 'Aquarium', price: 30, category: 'sight', mustHaves: [] },
  { types: ['movie_theater'], label: 'Cinema', price: 15, category: 'sight', mustHaves: [] },
];

/**
 * The fallback: searched when none of the group's must-haves maps to a place type, and
 * added to the wider second search, so the nearest of these that fits can still be offered.
 */
const FALLBACK_KINDS = ['Café', 'Museum', 'Park', 'Sight'];

/** Breakfast, lunch and dinner (minutes since midnight): only then is a meal suggested. */
export const MEAL_WINDOWS: [number, number][] = [
  [7 * 60 + 30, 9 * 60 + 30],
  [11 * 60 + 30, 14 * 60],
  [18 * 60, 20 * 60 + 30],
];

export const isMealTime = (minutes: number) => MEAL_WINDOWS.some(([a, b]) => minutes >= a && minutes <= b);

export function kindOf(types: string[]): Kind | null {
  return KINDS.find((k) => k.types.some((t) => types.includes(t))) ?? null;
}

const has = (list: string[], item: string) => list.some((x) => x.toLowerCase() === item.toLowerCase());

/** Meals only near a meal time, and not right before a food stop. */
function mealAllowed(req: Pick<NearbyRequest, 'localMinutes' | 'next'>): boolean {
  return isMealTime(req.localMinutes) && !req.next.isFood;
}

/**
 * Kinds worth searching for: the must-haves' kinds (else the fallback ones). The wider
 * second search adds the fallback kinds to the must-haves'.
 */
export function kindsToSearch(req: Pick<NearbyRequest, 'localMinutes' | 'next' | 'prefs'>, wider = false): Kind[] {
  const usable = KINDS.filter((k) => k.food !== 'meal' || mealAllowed(req));
  const wanted = usable.filter((k) => k.mustHaves.some((m) => has(req.prefs.mustHaves, m)));
  const fallback = usable.filter((k) => FALLBACK_KINDS.includes(k.label));
  if (wanted.length === 0) return fallback;
  return wider ? [...new Set([...wanted, ...fallback])] : wanted;
}

/** The includedTypes of a search (sorted, so the same list hits the same cache row). */
export function typesToSearch(req: Pick<NearbyRequest, 'localMinutes' | 'next' | 'prefs'>, wider = false): string[] {
  return [...new Set(kindsToSearch(req, wider).flatMap((k) => k.types))].sort();
}

// ---------- No-go ----------

/** Known no-gos (preferences screen) and what they rule out. */
const NO_GO_RULES: Record<string, { types: string[]; words: RegExp | null }> = {
  'long hikes': { types: ['hiking_area', 'national_park'], words: /\b(hike|hiking|trail|trek|trekking|summit)\b/i },
  'late nights': { types: ['bar', 'night_club'], words: /\b(bar|pub|club|lounge)\b/i },
  'early mornings': { types: [], words: null },
};

/** True if the place matches one of the group's no-gos (known ones, or the words of a typed one). */
export function matchesNoGo(place: Pick<NearbyPlace, 'name' | 'types'>, noGos: string[]): boolean {
  const text = `${place.name} ${place.types.join(' ').replace(/_/g, ' ')}`.toLowerCase();
  return noGos.some((raw) => {
    const noGo = raw.trim().toLowerCase();
    if (!noGo) return false;
    const rule = NO_GO_RULES[noGo];
    if (rule) return rule.types.some((t) => place.types.includes(t)) || !!rule.words?.test(place.name);
    // Typed by a member: any word of 4+ letters (without a plural "s") in the name or types.
    return noGo
      .split(/[^a-zÀ-ɏ]+/)
      .filter((w) => w.length >= 4)
      .map((w) => w.replace(/s$/, ''))
      .some((w) => text.includes(w));
  });
}

// ---------- Distances ----------

/** Straight-line distance in metres. */
export function metersBetween(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Minutes for one leg: walking up to 1.2 km, else a ride at 25 km/h. At least 1. */
export function legMinutes(a: LatLng, b: LatLng): number {
  const m = metersBetween(a, b);
  const minutes = m < WALK_UNDER_M ? m / WALK_M_PER_MIN : (m / 1000 / RIDE_KMH) * 60;
  return Math.max(1, Math.ceil(minutes));
}

/** Time to spend at a place: the spare time minus getting there and on to the next stop, at most 60 min. */
export function fillMinutes(spareMin: number, thereMin: number, onMin: number): number {
  return Math.min(MAX_FILL_MIN, Math.floor(spareMin - thereMin - onMin));
}

/** "400 m", "1.2 km". */
export function distanceText(m: number): string {
  if (m < 1000) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// ---------- Picking ----------

const normal = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The one suggestion, with simple rules (no AI):
 * - skip places already in the plan, anything matching a no-go, meals away from meal
 *   times, food that breaks someone's food needs, and places over today's budget;
 * - it must leave at least 20 min there after getting there and on to the next stop;
 * - places matching a must-have first (most chosen must-have first), then the nearest.
 */
export function pickSuggestion(places: NearbyPlace[], req: NearbyRequest): NearbySuggestion | null {
  const { prefs } = req;
  const plannedIds = new Set(req.planned.placeIds);
  const plannedNames = new Set(req.planned.names.map(normal));
  const vegetarian = has(prefs.foodNeeds, 'Vegetarian');
  const noSeafood = has(prefs.foodNeeds, 'No seafood');
  const halal = has(prefs.foodNeeds, 'Halal');

  const fits = places.flatMap((p) => {
    if (plannedIds.has(p.placeId) || plannedNames.has(normal(p.name))) return [];
    const kind = kindOf(p.types);
    if (!kind) return [];
    if (kind.food === 'meal') {
      if (!mealAllowed(req)) return [];
      if (vegetarian && !p.types.some((t) => t === 'vegetarian_restaurant' || t === 'vegan_restaurant')) return [];
    }
    if (kind.food && noSeafood && p.types.includes('seafood_restaurant')) return [];
    if (matchesNoGo(p, prefs.noGos)) return [];
    if (prefs.budgetLeft != null && kind.price > 0 && kind.price > prefs.budgetLeft) return [];
    const there = legMinutes(req.from, p);
    if (fillMinutes(req.spareMin, there, legMinutes(p, req.next)) < MIN_FILL_MIN) return [];
    // Most chosen must-have this place matches (index in the group's list), or none.
    const rank = prefs.mustHaves.findIndex((m) => kind.mustHaves.some((k) => normal(k) === normal(m)));
    return [{ p, kind, there, rank: rank < 0 ? Infinity : rank, distanceM: metersBetween(req.from, p) }];
  });
  const best = fits.sort((a, b) => a.rank - b.rank || a.distanceM - b.distanceM)[0];
  if (!best) return null;

  const { p, kind, there, distanceM } = best;
  const where = `${kind.label} ${distanceText(distanceM)} away`;
  const why =
    best.rank === Infinity ? 'fits your free time' : `matches your '${prefs.mustHaves[best.rank].toLowerCase()}' must-have`;
  return {
    placeId: p.placeId,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    kind: kind.label,
    category: kind.category,
    outdoor: !!kind.outdoor,
    distanceM: Math.round(distanceM),
    walkMin: there,
    price: kind.price,
    withinBudget: prefs.budgetLeft == null ? null : kind.price <= prefs.budgetLeft || kind.price === 0,
    reason: `${where} · ${why}`,
    halalNote: !!kind.food && halal,
  };
}

// ---------- Google, behind the caches ----------

/** The ~500 m area a point is in, and its centre (every point in it asks the same question). */
export function areaOf(p: LatLng): { key: string; centre: LatLng } {
  const snap = (v: number) => Math.round(v / AREA_STEP) * AREA_STEP;
  const centre = { lat: Number(snap(p.lat).toFixed(3)), lng: Number(snap(p.lng).toFixed(3)) };
  return { key: `${centre.lat.toFixed(3)},${centre.lng.toFixed(3)}`, centre };
}

export const nearbyKeys = {
  /** A search with more than the usual 5 results (the rain backup's) is its own row. */
  area: (p: LatLng, radiusM: number, types: string[], max = NEARBY_MAX_RESULTS) =>
    `nearby:${areaOf(p).key}:${radiusM}:${types.join(',')}${max === NEARBY_MAX_RESULTS ? '' : `:n${max}`}`,
  pick: (stopId: string) => `nearby-pick:${stopId}`,
  rain: (stopId: string) => `rain-pick:${stopId}`,
};

type Saved<T> = { at: number; value: T };

const isEmpty = (value: unknown) => value == null || (Array.isArray(value) && value.length === 0);

/** Saved and still fresh: an hour for a real answer, 10 min for an empty or failed one. */
function fresh<T>(deps: NearbyDeps, hit: unknown): hit is Saved<T> {
  const saved = hit as Saved<T> | undefined;
  if (typeof saved?.at !== 'number') return false;
  const minutes = isEmpty(saved.value) ? EMPTY_FRESH_MIN : NEARBY_FRESH_MIN;
  return deps.now() - saved.at < minutes * MIN;
}

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  types?: string[];
};

/** Google's places -> ours (ones without an id, name or location are left out). */
export function toPlaces(body: unknown): NearbyPlace[] {
  const raw = ((body as { places?: RawPlace[] } | null)?.places ?? []) as RawPlace[];
  return raw.flatMap((p) =>
    p.id && p.displayName?.text && p.location?.latitude != null && p.location?.longitude != null
      ? [{ placeId: p.id, name: p.displayName.text, lat: p.location.latitude, lng: p.location.longitude, types: p.types ?? [] }]
      : [],
  );
}

/** One Nearby Search around the area's centre (1 call). */
export async function searchNearby(
  deps: NearbyDeps,
  centre: LatLng,
  types: string[],
  radiusM = NEARBY_RADIUS_M,
  maxResults = NEARBY_MAX_RESULTS,
): Promise<NearbyPlace[]> {
  const res = await deps.fetch(NEARBY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': deps.apiKey, 'X-Goog-FieldMask': NEARBY_FIELDS },
    body: JSON.stringify({
      includedTypes: types,
      maxResultCount: maxResults,
      rankPreference: 'DISTANCE',
      locationRestriction: { circle: { center: { latitude: centre.lat, longitude: centre.lng }, radius: radiusM } },
    }),
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return toPlaces(await res.json());
}

type Found = { places: NearbyPlace[] | null; limited: boolean; calls: number };

/**
 * Places around `from`: cached area first, else one counted search (saved for an hour,
 * an empty answer for 10 min). A failed search gives null places (reported, not thrown).
 */
async function areaPlaces(
  deps: NearbyDeps,
  from: LatLng,
  radiusM: number,
  types: string[],
  onError: (e: unknown) => void,
  max = NEARBY_MAX_RESULTS,
): Promise<Found> {
  const key = nearbyKeys.area(from, radiusM, types, max);
  const hit = await deps.cacheGet(key);
  if (fresh<NearbyPlace[]>(deps, hit)) return { places: hit.value, limited: false, calls: 0 };
  if (!(await deps.takeCall())) return { places: null, limited: true, calls: 0 };
  try {
    const places = await searchNearby(deps, areaOf(from).centre, types, radiusM, max);
    await deps.cacheSet(key, { at: deps.now(), value: places } satisfies Saved<NearbyPlace[]>);
    return { places, limited: false, calls: 1 };
  } catch (e) {
    onError(e);
    return { places: null, limited: false, calls: 1 };
  }
}

/**
 * Up to two searches: 1 km for the must-haves; if nothing there passes the rules, 2 km for
 * the must-haves plus the fallback kinds (so the nearest park, museum, sight or café that
 * fits the time, budget and no-go is offered when no must-have place does). No second
 * search after Google failed or the daily limit was reached: it would end the same way.
 */
async function findSuggestion(deps: NearbyDeps, req: NearbyRequest, onError: (e: unknown) => void) {
  const near = await areaPlaces(deps, req.from, NEARBY_RADIUS_M, typesToSearch(req), onError);
  const first = near.places ? pickSuggestion(near.places, req) : null;
  if (first || !near.places) return { suggestion: first, limited: near.limited, calls: near.calls };
  const wide = await areaPlaces(deps, req.from, WIDER_RADIUS_M, typesToSearch(req, true), onError);
  return {
    suggestion: wide.places ? pickSuggestion(wide.places, req) : null,
    limited: wide.limited,
    calls: near.calls + wide.calls,
  };
}

const reply = (suggestion: NearbySuggestion | null, limited = false, placesCalls = 0): NearbyReply => ({
  suggestion,
  limited,
  placesCalls,
});

/**
 * The suggestion for the trip to one stop. Saved pick first; otherwise one request finds it
 * (area caches, or up to two counted Google searches) and saves it, while any other request
 * for the same stop waits a few seconds and reads that. Never throws: when nothing is usable
 * (or Google fails) the suggestion is null ("Enjoy the extra time"), saved for 10 min so other
 * phones don't pay for the same answer, but it's tried again soon.
 */
export async function nearbyFor(deps: NearbyDeps, req: NearbyRequest, onError: (e: unknown) => void = () => {}): Promise<NearbyReply> {
  const found = await onePerStop<NearbySuggestion | null>(
    deps,
    nearbyKeys.pick(req.stopId),
    null,
    async () => {
      const f = await findSuggestion(deps, req, onError);
      return { value: f.suggestion, limited: f.limited, calls: f.calls };
    },
    onError,
  );
  return reply(found.value, found.limited, found.calls);
}

type Answer<T> = { value: T; limited: boolean; calls: number };

/**
 * One answer per stop for the whole group: the saved one if fresh; otherwise this request
 * finds it and saves it, while any other request for the same key waits a few seconds and
 * reads that (or gives up with `none`: the other phone is slow). Never throws: any failure
 * gives `none`.
 */
async function onePerStop<T>(
  deps: NearbyDeps,
  key: string,
  none: T,
  find: () => Promise<Answer<T>>,
  onError: (e: unknown) => void,
): Promise<Answer<T>> {
  const saved = (value: T): Answer<T> => ({ value, limited: false, calls: 0 });
  try {
    const hit = await deps.cacheGet(key);
    if (fresh<T>(deps, hit)) return saved(hit.value);

    if (!(await deps.claim(key))) {
      for (let waited = 0; waited < WAIT_FOR_OTHER_MS; waited += WAIT_STEP_MS) {
        await deps.wait(WAIT_STEP_MS);
        const other = await deps.cacheGet(key);
        if (fresh<T>(deps, other)) return saved(other.value);
      }
      return saved(none);
    }
    try {
      const found = await find();
      await deps.cacheSet(key, { at: deps.now(), value: found.value } satisfies Saved<T>);
      return found;
    } finally {
      await deps.release(key);
    }
  } catch (e) {
    onError(e);
    return saved(none);
  }
}

// ---------- Rain backup ----------

/** Options on the rain card... */
export const RAIN_OPTIONS = 3;
/** ...from searches asking for this many places (Google charges per search, not per place). */
export const RAIN_MAX_RESULTS = 10;
/** Indoor kinds searched for the rain backup; restaurants are added near a meal time. */
const RAIN_KINDS = ['Café', 'Museum', 'Gallery', 'Mall', 'Aquarium', 'Cinema'];
/** A place with any of these types is (partly) outside: never a rain option. */
const OUTDOOR_TYPES = [
  'park',
  'beach',
  'hiking_area',
  'national_park',
  'campground',
  'zoo',
  'amusement_park',
  'water_park',
  'botanical_garden',
  'garden',
  'playground',
  'marina',
];

/** One indoor place on the rain card. */
export interface RainOption extends LatLng {
  placeId: string;
  name: string;
  /** "Museum", "Mall", "Café"... */
  kind: string;
  category: NearbySuggestion['category'];
  /** Straight line from the group, metres. */
  distanceM: number;
  /** Minutes to get there: a walk up to 1.2 km, else a ride at 25 km/h. */
  walkMin: number;
  ride: boolean;
  /** Rough price per person, RM (an estimate from the place type). */
  price: number;
  /** Food place and someone needs halal: show "Halal-friendly · not verified". */
  halalNote: boolean;
  /** The group's must-have it matches, if any. */
  mustHave: string | null;
}

export interface RainRequest {
  /** The outdoor stop the options would replace (one set of options per stop). */
  stopId: string;
  /** Where the group is. */
  from: LatLng;
  /** Time of day the new place would start (minutes since midnight): restaurants only near a meal time. */
  localMinutes: number;
  /** Already in the plan: never offered. */
  planned: NearbyRequest['planned'];
  /** budgetLeft = today's budget left, not counting the outdoor stop's own price when it's replaced. */
  prefs: GroupPrefs;
}

export interface RainReply {
  /** Up to 3 indoor places, nearest first; empty = "consider moving it". */
  options: RainOption[];
  /** True if a search was skipped because today's 10 nearby searches are used up. */
  limited: boolean;
  /** Real Google requests made for this reply. */
  placesCalls: number;
}

/** The includedTypes of the rain searches (sorted, so the same list hits the same cache row). */
const isRainKind = (k: Kind) => RAIN_KINDS.includes(k.label) || k.food === 'meal';

export function rainTypes(localMinutes: number): string[] {
  const kinds = KINDS.filter((k) => isRainKind(k) && (k.food !== 'meal' || isMealTime(localMinutes)));
  return [...new Set(kinds.flatMap((k) => k.types))].sort();
}

/**
 * Up to 3 indoor options, with the running-early rules (no AI): skip places already in the
 * plan, anything outdoor, matching a no-go, breaking someone's food needs or over today's
 * budget, and meals away from meal times. Must-have places first, then the nearest; shown
 * nearest first.
 */
export function pickRainOptions(places: NearbyPlace[], req: RainRequest): RainOption[] {
  const { prefs } = req;
  const plannedIds = new Set(req.planned.placeIds);
  const plannedNames = new Set(req.planned.names.map(normal));
  const vegetarian = has(prefs.foodNeeds, 'Vegetarian');
  const noSeafood = has(prefs.foodNeeds, 'No seafood');
  const halal = has(prefs.foodNeeds, 'Halal');
  const seen = new Set<string>();

  const fits = places.flatMap((p) => {
    if (seen.has(p.placeId)) return [];
    seen.add(p.placeId);
    if (plannedIds.has(p.placeId) || plannedNames.has(normal(p.name))) return [];
    if (p.types.some((t) => OUTDOOR_TYPES.includes(t))) return [];
    // The first indoor kind it has (an aquarium is often a "tourist_attraction" too).
    const kind = KINDS.find((k) => isRainKind(k) && k.types.some((t) => p.types.includes(t)));
    if (!kind) return [];
    const meal = kind.food === 'meal';
    if (meal) {
      if (!isMealTime(req.localMinutes)) return [];
      if (vegetarian && !p.types.some((t) => t === 'vegetarian_restaurant' || t === 'vegan_restaurant')) return [];
    }
    if (kind.food && noSeafood && p.types.includes('seafood_restaurant')) return [];
    if (matchesNoGo(p, prefs.noGos)) return [];
    if (prefs.budgetLeft != null && kind.price > 0 && kind.price > prefs.budgetLeft) return [];
    const rank = prefs.mustHaves.findIndex((m) => kind.mustHaves.some((k) => normal(k) === normal(m)));
    return [{ p, kind, rank: rank < 0 ? Infinity : rank, distanceM: metersBetween(req.from, p) }];
  });
  return fits
    .sort((a, b) => a.rank - b.rank || a.distanceM - b.distanceM)
    .slice(0, RAIN_OPTIONS)
    .sort((a, b) => a.distanceM - b.distanceM)
    .map(({ p, kind, rank, distanceM }) => ({
      placeId: p.placeId,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      kind: kind.label,
      category: kind.category,
      distanceM: Math.round(distanceM),
      walkMin: legMinutes(req.from, p),
      ride: distanceM >= WALK_UNDER_M,
      price: kind.price,
      halalNote: !!kind.food && halal,
      mustHave: rank === Infinity ? null : prefs.mustHaves[rank],
    }));
}

/**
 * 1 km first; only if fewer than 3 fit, 2 km too (the places of both picked again). No
 * second search after Google failed or the daily limit was reached.
 */
async function findRainOptions(deps: NearbyDeps, req: RainRequest, onError: (e: unknown) => void): Promise<Answer<RainOption[]>> {
  const types = rainTypes(req.localMinutes);
  const near = await areaPlaces(deps, req.from, NEARBY_RADIUS_M, types, onError, RAIN_MAX_RESULTS);
  const first = near.places ? pickRainOptions(near.places, req) : [];
  if (!near.places || first.length >= RAIN_OPTIONS) return { value: first, limited: near.limited, calls: near.calls };
  const wide = await areaPlaces(deps, req.from, WIDER_RADIUS_M, types, onError, RAIN_MAX_RESULTS);
  return {
    value: wide.places ? pickRainOptions([...near.places, ...wide.places], req) : first,
    limited: wide.limited,
    calls: near.calls + wide.calls,
  };
}

/**
 * The rain card's options for one outdoor stop. The saved set first (one per stop, for the
 * group); otherwise one request searches (area caches, or up to two counted Google searches)
 * and saves them while the others wait and read that. Never throws: nothing usable = [],
 * saved for 10 min like any empty answer.
 */
export async function rainOptionsFor(deps: NearbyDeps, req: RainRequest, onError: (e: unknown) => void = () => {}): Promise<RainReply> {
  const found = await onePerStop<RainOption[]>(deps, nearbyKeys.rain(req.stopId), [], () => findRainOptions(deps, req, onError), onError);
  return { options: found.value, limited: found.limited, placesCalls: found.calls };
}

// ---------- The group's preferences ----------

/** The rows of `preferences` and `stops` the group summary reads. */
export interface PrefRow {
  daily_budget: number | string | null;
  food_needs: string[] | null;
  must_haves: string[] | null;
  no_go: string | null;
}
export interface PlanRow {
  name: string;
  place_id: string | null;
  day_number: number;
  status: string | null;
  price: number | string | null;
  actual_cost: number | string | null;
}

/** Everyone's answers as one GroupPrefs, and what's already in the plan. */
export function groupPrefs(prefs: PrefRow[], stops: PlanRow[], day: number): { prefs: GroupPrefs; planned: NearbyRequest['planned'] } {
  const count = new Map<string, number>();
  for (const p of prefs) for (const m of p.must_haves ?? []) count.set(m, (count.get(m) ?? 0) + 1);
  const mustHaves = [...count].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  const foodNeeds = [...new Set(prefs.flatMap((p) => p.food_needs ?? []))];
  const noGos = [...new Set(prefs.map((p) => p.no_go ?? '').filter((n) => n.trim()))];
  const daily = prefs.map((p) => Number(p.daily_budget)).filter((b) => Number.isFinite(b) && b > 0);
  const inPlan = stops.filter((s) => s.status !== 'dropped');
  const today = inPlan
    .filter((s) => s.day_number === day)
    .reduce((sum, s) => sum + (Number(s.actual_cost ?? s.price) || 0), 0);
  return {
    prefs: { mustHaves, foodNeeds, noGos, budgetLeft: daily.length ? Math.min(...daily) - today : null },
    planned: {
      placeIds: inPlan.map((s) => s.place_id).filter((id): id is string => !!id),
      names: inPlan.map((s) => s.name),
    },
  };
}
