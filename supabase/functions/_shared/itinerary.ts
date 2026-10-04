// Day-by-day itinerary types and the sample plan. Shared by the app (lib/ai.ts) and,
// later, the generate-itinerary Edge Function, so both fall back to the same data.
// Plain TypeScript with no imports: it has to run in both React Native and Deno.

export type StopCategory = 'flight' | 'hotel' | 'sight' | 'food' | 'beach' | 'shopping';

export interface ItineraryRequest {
  /** The chosen trip, e.g. "Penang" or "Bali · Beach & chill". */
  destination: string;
  days: number;
  /** One title per day from the trip option, e.g. "Penang Hill & George Town". */
  dayTitles: string[];
  /** Someone in the group eats halal. */
  halal: boolean;
}

export interface StopDraft {
  /** 1-based. */
  day: number;
  /** Local time "HH:MM". */
  time: string;
  endTime: string | null;
  name: string;
  /** Per person, RM. */
  price: number;
  isEstimate: boolean;
  category: StopCategory;
  isOutdoor: boolean;
  tip: string | null;
  lat: number | null;
  lng: number | null;
  /** From Google Places, when found. */
  address?: string | null;
  placeId?: string | null;
}

type Seed = [time: string, name: string, price: number, estimate: boolean, category: StopCategory, outdoor: boolean, lat: number, lng: number, tip: string];

/** Real Penang stops (lat/lng), one list per day. Used when the trip is Penang. */
const PENANG: Seed[][] = [
  [
    ['08:30', 'Roti canai at Transfer Road', 6, true, 'food', false, 5.4196, 100.3327, 'Order roti telur with dhal; it is cash only.'],
    ['09:30', 'Penang Hill funicular', 15, false, 'sight', true, 5.4239, 100.2691, 'Go before 10:00 to skip the queue. Fast lane costs more.'],
    ['12:30', 'Nasi kandar at Line Clear', 15, true, 'food', false, 5.4183, 100.3318, 'Ask for "kuah campur" to get all the curries mixed.'],
    ['14:30', 'Armenian Street murals', 0, false, 'sight', true, 5.4151, 100.3376, 'The famous "Kids on Bicycle" mural is at the corner of Armenian Street.'],
    ['16:00', 'Cheong Fatt Tze Blue Mansion', 25, false, 'sight', false, 5.4214, 100.3355, 'Entry is by guided tour only, roughly every hour.'],
    ['19:00', 'Chulia Street street food', 16, true, 'food', true, 5.4172, 100.3364, 'Stalls open after 18:00. Bring small notes.'],
  ],
  [
    ['08:30', 'Breakfast at Toh Soon Cafe', 10, true, 'food', false, 5.418, 100.3329, 'Charcoal-toasted bread with kaya. Expect a short wait.'],
    ['10:00', 'Tropical Spice Garden', 30, false, 'sight', true, 5.471, 100.2486, 'Free audio guide at the gate. Wear mosquito spray.'],
    ['12:30', 'Lunch at Long Beach food court', 18, true, 'food', false, 5.4763, 100.2468, 'Order at the stalls, pay when the food comes.'],
    ['14:00', 'Batu Ferringhi beach', 0, false, 'beach', true, 5.4742, 100.2462, 'Jet ski prices are per 15 minutes; agree on the price first.'],
    ['19:00', 'Batu Ferringhi night market', 20, true, 'shopping', true, 5.4757, 100.2481, 'Haggling is normal. Start at about half the asking price.'],
  ],
  [
    ['08:30', 'Breakfast at Hameediyah', 12, true, 'food', false, 5.4183, 100.3349, 'One of the oldest nasi kandar shops in Penang (since 1907).'],
    ['10:00', 'Chew Jetty', 0, false, 'sight', true, 5.4136, 100.3401, 'People live here; keep voices down and do not enter homes.'],
    ['11:30', 'Fort Cornwallis', 20, false, 'sight', true, 5.4207, 100.3436, 'Little shade inside. Bring water and a hat.'],
    ['13:00', 'Lunch at Kapitan', 15, true, 'food', false, 5.417, 100.3383, 'Try the claypot chicken biryani.'],
    ['15:00', 'Gurney Plaza', 0, false, 'shopping', false, 5.4373, 100.3096, 'Good indoor place if it rains.'],
    ['19:00', 'Gurney Drive hawker centre', 20, true, 'food', true, 5.4378, 100.3107, 'Halal stalls are on the left side as you walk in.'],
  ],
  [
    ['09:00', 'Kek Lok Si Temple', 0, false, 'sight', true, 5.3999, 100.2738, 'The inclinator to the big statue is RM 16 return.'],
    ['12:00', 'Air Itam laksa', 9, true, 'food', true, 5.4007, 100.2774, 'Sour and spicy fish soup; ask for less chilli if needed.'],
    ['14:00', 'Penang Botanic Gardens', 0, false, 'sight', true, 5.4385, 100.2905, 'Do not feed the monkeys; keep bags closed.'],
    ['19:00', 'New Lane hawker food', 18, true, 'food', true, 5.413, 100.324, 'Opens around 17:00, closes before midnight.'],
  ],
  [
    ['09:30', 'Fruit farm in Balik Pulau', 20, true, 'sight', true, 5.35, 100.23, 'Durian season is roughly June to August.'],
    ['12:30', 'Balik Pulau laksa', 9, true, 'food', false, 5.3507, 100.2353, 'Small shop, busy at lunch. Go a bit early.'],
    ['15:00', 'Entopia butterfly farm', 65, false, 'sight', false, 5.4466, 100.2104, 'Fully indoor: a good rain backup.'],
    ['19:00', 'Dinner at Teluk Bahang', 25, true, 'food', false, 5.4594, 100.2153, 'Seafood is priced by weight; ask before ordering.'],
  ],
];

/** "Penang Hill & George Town" -> ["Penang Hill", "George Town"] */
function splitTitle(title: string): string[] {
  return title
    .split(/\s*(?:&|\band\b|,)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A simple day for places without seed stops: breakfast, two sights, lunch, dinner. */
function genericDay(day: number, title: string, place: string, halal: boolean): StopDraft[] {
  const parts = splitTitle(title);
  const first = parts[0] ?? `Explore ${place}`;
  const second = parts[1] ?? `${first} (afternoon)`;
  const food = halal ? 'halal ' : '';
  const stop = (time: string, name: string, price: number, category: StopCategory, isOutdoor: boolean, tip: string | null): StopDraft => ({
    day,
    time,
    endTime: null,
    name,
    price,
    isEstimate: true,
    category,
    isOutdoor,
    tip,
    lat: null,
    lng: null,
  });
  return [
    stop('08:30', `Breakfast at a ${food}local café`, 10, 'food', false, 'Ask what the locals order.'),
    stop('10:00', first, 20, 'sight', true, null),
    stop('12:30', `Lunch near ${first}`, 18, 'food', false, null),
    stop('14:30', second, 15, 'sight', true, null),
    stop('19:00', `Dinner at a ${food}night market`, 25, 'food', true, 'Bring cash in small notes.'),
  ];
}

/** Sample day-by-day plan for the chosen trip. Same input always gives the same plan. */
export function sampleItinerary(req: ItineraryRequest): StopDraft[] {
  const days = Math.max(1, Math.round(req.days));
  const place = req.destination.split('·')[0].trim() || 'town';
  const isPenang = /penang/i.test(place);
  const out: StopDraft[] = [];
  for (let day = 1; day <= days; day++) {
    const seed = isPenang ? PENANG[(day - 1) % PENANG.length] : null;
    if (seed) {
      for (const [time, name, price, isEstimate, category, isOutdoor, lat, lng, tip] of seed) {
        out.push({ day, time, endTime: null, name, price, isEstimate, category, isOutdoor, tip, lat, lng });
      }
    } else {
      const title = req.dayTitles[day - 1] ?? `Free day in ${place}`;
      out.push(...genericDay(day, title, place, req.halal));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// AI itinerary (generate-itinerary Edge Function): prompt, checks, retry,
// budget fit and Google Places lookups. Gemini and Google come in as `deps`
// so this file needs no imports and tests can use fake answers.

export interface PlannerMember {
  dailyBudget: number | null;
  foodNeeds: string[];
  mustHaves: string[];
  noGo: string | null;
}

export interface ItineraryInput extends ItineraryRequest {
  /** First day, 'YYYY-MM-DD'; null if dates are not set. */
  startDate: string | null;
  members: PlannerMember[];
  /** Group budget per person for the whole trip (lowest daily budget × days); null if none set. */
  budget: number | null;
}

interface FoundPlace {
  placeId: string;
  address: string | null;
  lat: number;
  lng: number;
}

export interface PlannerDeps {
  /** Ask Gemini; `attempt` is 0 or 1. Null when there's no API key. */
  ask: ((prompt: string, attempt: number) => Promise<string>) | null;
  /** Look a stop up in Google Places (cache first). Null when there's no Google key. */
  findPlace:
    | ((query: string, near: { lat: number; lng: number } | null) => Promise<{ value: FoundPlace | null; limited: boolean; calls: number }>)
    | null;
  log?: (message: string) => void;
}

export interface ItineraryResponse {
  stops: StopDraft[];
  source: 'ai' | 'sample';
  /** Small note for the app, e.g. when Google's daily limit was reached. */
  note: string | null;
  googleCalls: number;
}

const CATEGORIES: StopCategory[] = ['sight', 'food', 'beach', 'shopping'];
const MIN_STOPS = 3;
const MAX_STOPS = 7;
/** Google results further than this from Gemini's own location are probably the wrong place. */
const MAX_PLACE_DRIFT_KM = 40;

export class OverBudgetError extends Error {
  total: number;
  budget: number;
  stops: StopDraft[];
  constructor(total: number, budget: number, stops: StopDraft[]) {
    super(`The plan costs RM ${total} per person but the budget is RM ${budget}. Make it cheaper.`);
    this.total = total;
    this.budget = budget;
    this.stops = stops;
  }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayLabel(start: string, day: number): string {
  const [y, m, d] = start.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + day - 1));
  return ` ${WEEKDAYS[date.getUTCDay()]} ${date.toISOString().slice(0, 10)}`;
}

export function buildItineraryPrompt(input: ItineraryInput, feedback?: string): string {
  const days = Array.from({ length: input.days }, (_, i) => {
    const title = input.dayTitles[i] ? ` (theme: ${input.dayTitles[i]})` : '';
    const when = input.startDate ? dayLabel(input.startDate, i + 1) : '';
    return `Day ${i + 1}${when}${title}`;
  }).join('\n');
  const members = input.members
    .map(
      (m, i) =>
        `Member ${i + 1}: daily budget ${m.dailyBudget != null ? `RM ${m.dailyBudget}` : 'not set'}; food needs: ${m.foodNeeds.join(', ') || 'none'}; must-haves: ${m.mustHaves.join(', ') || 'none'}; no-go: ${m.noGo ?? 'none'}.`,
    )
    .join('\n');
  const budget =
    input.budget != null
      ? `The total of every stop's price, all days together, must be at most RM ${Math.round(input.budget)} per person. Aim for about RM ${Math.round(input.budget * 0.6)}, because the hotel and travel are added separately.`
      : 'Keep it good value.';
  const halal = input.halal
    ? 'Someone needs halal food: EVERY food stop must be a halal or Muslim-friendly place, with "halal": true.'
    : 'Set "halal" honestly for food stops.';

  return `You plan day-by-day group trips for a travel app used in Malaysia. Prices are in Malaysian ringgit (RM), per person.

Trip: ${input.destination}, ${input.days} day${input.days === 1 ? '' : 's'}:
${days}

What each member answered:
${members}

Rules:
- ${MIN_STOPS} to 6 stops per day, real named places that exist (no "local café"), in the order they are visited, with time to travel between them.
- Include lunch and dinner each day as food stops.
- Cover the group's must-haves across the days. Never plan anything that is someone's no-go (no starts before 08:00 if "Early mornings" is a no-go, nothing after 22:00 if "Late nights", no long hikes if "Long hikes").
- ${halal}
- ${budget}
- "start" and "end": 24-hour "HH:MM", end after start.
- "price": per person in RM (0 if free). "estimate": true when the price is a guess (food, markets), false for fixed ticket prices.
- "outdoor": true if the stop is mostly outside (matters for rain).
- "category": one of ${CATEGORIES.join(', ')}.
- "search": the place name plus area and city, for Google Maps, e.g. "Kek Lok Si Temple, Air Itam, Penang".
- "lat"/"lng": your best guess of the location.
- "tip": one short, practical first-timer tip (max 20 words).
No flights or hotels: the group adds those themselves.
${feedback ? `\nYour last answer had a problem: ${feedback}\nFix it.\n` : ''}
Reply with JSON only, no other text, in this shape:
{"days":[{"day":1,"stops":[{"name":"","search":"","start":"09:00","end":"10:30","price":0,"estimate":false,"outdoor":true,"category":"sight","halal":false,"tip":"","lat":5.4,"lng":100.3}]}]}`;
}

const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const minutesOf = (t: string) => {
  const m = CLOCK.exec(t)!;
  return Number(m[1]) * 60 + Number(m[2]);
};
const pad2 = (n: number) => String(n).padStart(2, '0');
const tidyClock = (t: string) => {
  const mins = minutesOf(t);
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
};

function fail(message: string): never {
  throw new Error(message);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Total of every stop's price. */
export function planTotal(stops: Pick<StopDraft, 'price'>[]): number {
  return stops.reduce((sum, s) => sum + s.price, 0);
}

/**
 * Check Gemini's answer and turn it into stops. Throws a plain reason (sent
 * back to Gemini on the retry) when it can't be used; OverBudgetError when the
 * only problem is the price.
 */
export function checkItinerary(text: string, input: ItineraryInput): StopDraft[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('The answer was not valid JSON.');
  }
  if (!isObj(raw) || !Array.isArray(raw.days)) fail('The answer needs a "days" list.');
  const allDays = raw.days as unknown[];
  const stops: StopDraft[] = [];
  for (let day = 1; day <= input.days; day++) {
    const entry = allDays.find((d) => isObj(d) && num(d.day) === day) ?? allDays[day - 1];
    if (!isObj(entry) || !Array.isArray(entry.stops)) fail(`Day ${day} is missing.`);
    const list = entry.stops as unknown[];
    if (list.length < MIN_STOPS) fail(`Day ${day} needs at least ${MIN_STOPS} stops.`);
    const dayStops: StopDraft[] = [];
    for (const s of list.slice(0, MAX_STOPS)) {
      if (!isObj(s)) fail(`Day ${day} has a stop that is not an object.`);
      const name = str(s.name, 80) ?? fail(`A stop on day ${day} has no name.`);
      const start = typeof s.start === 'string' && CLOCK.test(s.start.trim()) ? s.start.trim() : fail(`"${name}" needs a start time like 09:00.`);
      const end = typeof s.end === 'string' && CLOCK.test(s.end.trim()) ? s.end.trim() : fail(`"${name}" needs an end time like 10:30.`);
      if (minutesOf(end) <= minutesOf(start)) fail(`"${name}" ends before it starts.`);
      const price = num(s.price);
      if (price == null || price < 0 || price > 5000) fail(`"${name}" needs a price in RM (0 if free).`);
      const category = CATEGORIES.includes(s.category as StopCategory) ? (s.category as StopCategory) : 'sight';
      if (input.halal && category === 'food' && s.halal !== true) {
        fail(`"${name}" is a food stop but not halal; every food stop must be halal.`);
      }
      const lat = num(s.lat);
      const lng = num(s.lng);
      const located = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
      dayStops.push({
        day,
        time: tidyClock(start),
        endTime: tidyClock(end),
        name,
        price: Math.round(price),
        isEstimate: s.estimate !== false,
        category,
        isOutdoor: s.outdoor === true,
        tip: str(s.tip, 160),
        lat: located ? lat : null,
        lng: located ? lng : null,
        address: str(s.search, 160), // the search text until Google gives the real address
        placeId: null,
      });
    }
    dayStops.sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
    stops.push(...dayStops);
  }
  const total = planTotal(stops);
  if (input.budget != null && total > input.budget) throw new OverBudgetError(total, Math.round(input.budget), stops);
  return stops;
}

/**
 * Make a plan that's over budget fit: drop the most expensive non-food stops
 * first (keeping at least 3 a day), then scale the remaining prices down.
 */
export function fitToBudget(stops: StopDraft[], budget: number): StopDraft[] {
  let out = [...stops];
  while (planTotal(out) > budget) {
    const perDay = (day: number) => out.filter((s) => s.day === day).length;
    const droppable = out
      .filter((s) => s.category !== 'food' && s.price > 0 && perDay(s.day) > MIN_STOPS)
      .sort((a, b) => b.price - a.price)[0];
    if (!droppable) break;
    out = out.filter((s) => s !== droppable);
  }
  const total = planTotal(out);
  if (total > budget) {
    const scale = budget / total;
    out = out.map((s) => ({ ...s, price: Math.floor(s.price * scale), isEstimate: true }));
  }
  return out;
}

export const GOOGLE_LIMIT_NOTE = "Google's daily limit for this trip was reached, so some places use approximate locations.";

function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Real address, location and place ID for each stop (cache first; stops that have a place ID are skipped). */
async function addPlaces(stops: StopDraft[], input: ItineraryInput, deps: PlannerDeps) {
  let calls = 0;
  let limited = false;
  const out = [...stops];
  if (!deps.findPlace) return { stops: out, calls, limited };
  const place = input.destination.split('·')[0].trim();
  for (let i = 0; i < out.length; i += 4) {
    await Promise.all(
      out.slice(i, i + 4).map(async (s, j) => {
        if (s.placeId) return;
        if (!s.address && s.lat == null) return; // a made-up sample stop ("local café"): nothing real to find
        const query = s.address && s.address !== s.name ? s.address : `${s.name}, ${place}`;
        const near = s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null;
        try {
          const found = await deps.findPlace!(query, near);
          calls += found.calls;
          if (found.limited) limited = true;
          const p = found.value;
          const drift = p && near ? kmBetween(near, p) : 0;
          if (p && drift <= MAX_PLACE_DRIFT_KM) {
            out[i + j] = { ...s, placeId: p.placeId, address: p.address, lat: p.lat, lng: p.lng };
          }
        } catch (e) {
          deps.log?.(`Places lookup failed for "${s.name}": ${e instanceof Error ? e.message : e}`);
        }
      }),
    );
  }
  return { stops: out, calls, limited };
}

/**
 * The whole flow: Gemini (one retry with the problem explained), else the
 * sample plan; then Google Places for each stop. Never throws.
 */
export async function planItinerary(input: ItineraryInput, deps: PlannerDeps): Promise<ItineraryResponse> {
  let stops: StopDraft[] | null = null;
  let overBudget: OverBudgetError | null = null;
  if (deps.ask) {
    let feedback: string | undefined;
    for (let attempt = 0; attempt < 2 && !stops; attempt++) {
      try {
        stops = checkItinerary(await deps.ask(buildItineraryPrompt(input, feedback), attempt), input);
      } catch (e) {
        if (e instanceof OverBudgetError) overBudget = e;
        feedback = e instanceof Error ? e.message : String(e);
        deps.log?.(`generate-itinerary attempt ${attempt + 1} failed: ${feedback}`);
      }
    }
    if (!stops && overBudget) stops = fitToBudget(overBudget.stops, overBudget.budget);
  }
  const source: ItineraryResponse['source'] = stops ? 'ai' : 'sample';
  const placed = await addPlaces(stops ?? sampleItinerary(input), input, deps);
  return {
    // Only Google's addresses are real; drop Gemini's search text.
    stops: placed.stops.map((s) => (s.placeId ? s : { ...s, address: null, placeId: null })),
    source,
    note: placed.limited ? GOOGLE_LIMIT_NOTE : null,
    googleCalls: placed.calls,
  };
}
