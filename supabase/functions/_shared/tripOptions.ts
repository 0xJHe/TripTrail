// Trip option types and the sample options. Shared by the app (lib/ai.ts) and the
// generate-trip-options Edge Function, so both fall back to exactly the same data.
// Plain TypeScript with no imports: it has to run in both React Native and Deno.

/** Picture drawn at the top of an option card. */
export type SceneKind = 'temple' | 'island' | 'city' | 'heritage' | 'highlands' | 'beach';
export const SCENES: SceneKind[] = ['temple', 'island', 'city', 'heritage', 'highlands', 'beach'];

export interface MemberAnswers {
  dailyBudget: number | null;
  foodNeeds: string[];
  mustHaves: string[];
  noGo: string | null;
}

export interface TripOptionsRequest {
  /** Null when the group decides where to go. */
  destination: string | null;
  lengthMin: number;
  lengthMax: number;
  members: MemberAnswers[];
  /** Each answering member's free dates ('YYYY-MM-DD'), to check shared dates. */
  freeDates?: string[][];
  /** Everyone in the trip, including members who haven't answered. */
  totalMembers?: number;
}

export interface OptionPhoto {
  url: string;
  /** Photographer credit Google returns; shown on the photo. */
  credit: string | null;
  creditUrl: string | null;
  /** Google place ID of the landmark (older saved options kept it here). */
  placeId?: string;
}

export interface TripOptionDraft {
  name: string;
  days: number;
  /** Per person for the whole trip, RM. */
  costPerPerson: number;
  tags: string[];
  covers: string[];
  avoids: string[];
  halal: boolean;
  scene: SceneKind;
  dayTitles: string[];
  /** Well-known landmark or area for the card photo, e.g. "Kek Lok Si Temple, Penang". */
  landmark?: string | null;
  /** Google place ID of the landmark, kept so an expired photo link can be refreshed. */
  placeId?: string | null;
  /** One Google photo of the landmark; null = keep the drawing. */
  photo?: OptionPhoto | null;
  /** True when the photo was skipped because Google's daily limit was reached. */
  photoLimited?: boolean;
}

export const OPTION_COUNT = 5;

interface Place {
  name: string;
  idealDays: number;
  perDay: number;
  tags: string[];
  covers: string[];
  avoids: string[];
  halal: boolean;
  scene: SceneKind;
  dayTitles: string[];
  /** Well-known spot whose photo goes on the card. */
  landmark: string;
}

const PLACES: Place[] = [
  {
    name: 'Penang',
    idealDays: 3,
    perDay: 127,
    tags: ['Street food', 'Temples', 'Beach'],
    covers: ['Street food', 'Beach', 'Famous sights', 'Museums', 'Cafés', 'Nature'],
    avoids: [],
    halal: true,
    scene: 'temple',
    dayTitles: ['Penang Hill & George Town', 'Batu Ferringhi beach', 'Clan Jetties & Gurney', 'Kek Lok Si & Air Itam', 'Balik Pulau farms'],
    landmark: 'Kek Lok Si Temple, Penang',
  },
  {
    name: 'Langkawi',
    idealDays: 3,
    perDay: 150,
    tags: ['Islands', 'Cable car', 'Beach'],
    covers: ['Beach', 'Nature', 'Adventure', 'Shopping'],
    avoids: [],
    halal: true,
    scene: 'island',
    dayTitles: ['Cable car & Sky Bridge', 'Island hopping', 'Cenang beach & night market', 'Mangrove kayak', 'Duty-free shopping'],
    landmark: 'Langkawi Sky Bridge',
  },
  {
    name: 'Bangkok',
    idealDays: 3,
    perDay: 203,
    tags: ['Night markets', 'Temples', 'Shopping'],
    covers: ['Street food', 'Famous sights', 'Nightlife', 'Shopping', 'Museums', 'Cafés'],
    avoids: ['Late nights'],
    halal: false,
    scene: 'city',
    dayTitles: ['Grand Palace & Wat Pho', 'Chatuchak & Siam malls', 'Chinatown food night', 'Floating market', 'Rooftop views'],
    landmark: 'Wat Arun, Bangkok',
  },
  {
    name: 'Melaka',
    idealDays: 2,
    perDay: 130,
    tags: ['Heritage', 'Night market', 'River cruise'],
    covers: ['Street food', 'Famous sights', 'Museums', 'Cafés', 'Shopping'],
    avoids: [],
    halal: true,
    scene: 'heritage',
    dayTitles: ['Jonker Walk & Red Square', 'River cruise & museums', 'Portuguese Settlement', "St Paul's Hill", 'Klebang beach'],
    landmark: 'Christ Church Melaka',
  },
  {
    name: 'Ipoh',
    idealDays: 2,
    perDay: 110,
    tags: ['Cafés', 'Cave temples', 'Old town'],
    covers: ['Street food', 'Cafés', 'Nature', 'Famous sights'],
    avoids: [],
    halal: true,
    scene: 'highlands',
    dayTitles: ['Old town murals & white coffee', 'Cave temples & lake', 'Lost World park', 'Kellie’s Castle', 'Hot springs'],
    landmark: 'Kek Look Tong cave temple, Ipoh',
  },
  {
    name: 'Cameron Highlands',
    idealDays: 3,
    perDay: 120,
    tags: ['Tea farms', 'Cool weather', 'Jungle trails'],
    covers: ['Nature', 'Adventure', 'Cafés'],
    avoids: ['Long hikes', 'Early mornings'],
    halal: true,
    scene: 'highlands',
    dayTitles: ['Tea farm & scones', 'Mossy Forest sunrise walk', 'Strawberry farms & market', 'Jungle trail 10', 'Butterfly garden'],
    landmark: 'BOH Tea Plantation Sungai Palas, Cameron Highlands',
  },
  {
    name: 'Kota Kinabalu',
    idealDays: 4,
    perDay: 190,
    tags: ['Islands', 'Seafood', 'Sunsets'],
    covers: ['Beach', 'Nature', 'Adventure', 'Street food'],
    avoids: [],
    halal: true,
    scene: 'beach',
    dayTitles: ['Waterfront & night market', 'Island hopping & snorkel', 'Kinabalu Park', 'River safari', 'Tip of Borneo'],
    landmark: 'Kota Kinabalu City Mosque',
  },
  {
    name: 'Singapore',
    idealDays: 3,
    perDay: 260,
    tags: ['City sights', 'Hawker food', 'Gardens'],
    covers: ['Famous sights', 'Street food', 'Shopping', 'Museums', 'Nightlife', 'Cafés'],
    avoids: [],
    halal: true,
    scene: 'city',
    dayTitles: ['Marina Bay & Gardens', 'Hawker centres & Chinatown', 'Sentosa', 'Museums & Kampong Glam', 'Orchard Road'],
    landmark: 'Gardens by the Bay, Singapore',
  },
  {
    name: 'Tioman',
    idealDays: 3,
    perDay: 170,
    tags: ['Snorkelling', 'Beach', 'Jungle'],
    covers: ['Beach', 'Nature', 'Adventure'],
    avoids: [],
    halal: true,
    scene: 'beach',
    dayTitles: ['Ferry & Salang beach', 'Snorkel at Coral Island', 'Jungle walk to Juara', 'Waterfall swim', 'Lazy beach day'],
    landmark: 'Salang Beach, Tioman Island',
  },
];

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const roundTo10 = (n: number) => Math.round(n / 10) * 10;

/** Smallest daily budget in the group (what everyone can afford). */
function groupDailyBudget(members: MemberAnswers[]): number {
  const budgets = members.map((m) => m.dailyBudget).filter((b): b is number => b != null && b > 0);
  return budgets.length ? Math.min(...budgets) : 150;
}

function scorePlace(place: Place, days: number, cost: number, req: TripOptionsRequest): number {
  let score = 0;
  for (const m of req.members) {
    score += 2 * m.mustHaves.filter((x) => place.covers.includes(x)).length;
    if (m.noGo && place.avoids.includes(m.noGo)) score -= 3;
    if (m.foodNeeds.includes('Halal') && !place.halal) score -= 3;
    if (m.dailyBudget != null && m.dailyBudget * days < cost) score -= 1;
  }
  return score;
}

/** Sample options for "let the group decide": the 5 places that best fit everyone. */
function samplePlaces(req: TripOptionsRequest): TripOptionDraft[] {
  return PLACES.map((place, order) => {
    const days = clamp(place.idealDays, req.lengthMin, req.lengthMax);
    const cost = roundTo10(place.perDay * days);
    return { place, days, cost, order, score: scorePlace(place, days, cost, req) };
  })
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, OPTION_COUNT)
    .map(({ place, days, cost }) => ({
      name: place.name,
      days,
      costPerPerson: cost,
      tags: place.tags,
      covers: place.covers,
      avoids: place.avoids,
      halal: place.halal,
      scene: place.scene,
      dayTitles: place.dayTitles.slice(0, days),
      landmark: place.landmark,
    }));
}

/** Sample options when the destination is already known: three styles of the same trip. */
function sampleStyles(destination: string, req: TripOptionsRequest): TripOptionDraft[] {
  const days = req.lengthMax;
  const daily = groupDailyBudget(req.members);
  const wanted = [...new Set(req.members.flatMap((m) => m.mustHaves))];
  const halal = req.members.some((m) => m.foodNeeds.includes('Halal'));
  const styles: { name: string; share: number; scene: SceneKind; extra: string[]; titles: string[] }[] = [
    {
      name: `${destination} highlights`,
      share: 0.95,
      scene: 'temple',
      extra: ['Famous sights', 'Street food'],
      titles: ['Famous sights', 'Food trail', 'Markets & views', 'Day trip out of town', 'Favourite spots again'],
    },
    {
      name: `${destination}, easy pace`,
      share: 0.8,
      scene: 'beach',
      extra: ['Cafés', 'Nature'],
      titles: ['Slow morning, café & walk', 'Nature spot & long lunch', 'Free day', 'Sunset spot', 'Brunch & shopping'],
    },
    {
      name: `${destination} on a budget`,
      share: 0.6,
      scene: 'heritage',
      extra: ['Street food', 'Museums'],
      titles: ['Free walking tour', 'Street food crawl', 'Parks & free museums', 'Night market', 'Local favourites'],
    },
  ];
  return styles.map((s) => {
    const covers = [...new Set([...wanted.slice(0, 2), ...s.extra])];
    return {
      name: s.name,
      days,
      costPerPerson: roundTo10(daily * s.share * days),
      tags: covers.slice(0, 3),
      covers,
      avoids: [],
      halal,
      scene: s.scene,
      dayTitles: s.titles.slice(0, days),
      landmark: destination,
    };
  });
}

export function sampleTripOptions(req: TripOptionsRequest): TripOptionDraft[] {
  const destination = req.destination?.trim();
  return destination ? sampleStyles(destination, req) : samplePlaces(req);
}

// ---------------------------------------------------------------------------
// AI trip options (generate-trip-options Edge Function): prompt, checks, one
// retry, the group-fit rules and the card photos. Gemini and Google come in as
// `deps` so this file needs no imports and tests can use fake answers.

export const MUST_HAVES = ['Beach', 'Street food', 'Famous sights', 'Nightlife', 'Shopping', 'Nature', 'Museums', 'Cafés', 'Adventure'];
export const NO_GOS = ['Early mornings', 'Late nights', 'Long hikes'];
const MIN_OPTIONS = 4;
const MAX_OPTIONS = 5;

export interface OptionsDeps {
  /** Ask Gemini; `attempt` is 0 or 1. Null when there's no API key. */
  ask: ((prompt: string, attempt: number) => Promise<string>) | null;
  /** One photo for a landmark (cache first). Null when there's no Google key. */
  findPhoto: ((landmark: string) => Promise<{ value: OptionPhoto | null; limited: boolean; calls: number }>) | null;
  log?: (message: string) => void;
}

export interface TripOptionsResponse {
  options: TripOptionDraft[];
  source: 'ai' | 'sample';
  /** Why the options can't fit everyone, e.g. "No dates suit all 4, these suit 3 of 4". Null when they all fit. */
  note: string | null;
  /** Why Gemini wasn't used (only when source is 'sample'). */
  reason?: string;
  googleCalls: number;
}

/** What every option has to fit. */
export interface GroupLimits {
  /** Lowest daily budget in the group; null when nobody set one. */
  dailyBudget: number | null;
  halal: boolean;
  noGos: string[];
  /** Members who gave free dates. */
  answered: number;
  /** Longest run of days everyone who answered is free; null when dates aren't known. */
  sharedRun: number | null;
  /** Most members free for `lengthMin` days in a row (any dates). */
  bestFree: number | null;
}

function addDayUTC(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Longest run of consecutive dates found in every list. */
export function longestSharedRun(lists: string[][]): number {
  if (lists.length === 0) return 0;
  const sets = lists.map((l) => new Set(l));
  const shared = lists[0].filter((d) => sets.every((s) => s.has(d))).sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < shared.length; i++) {
    run = i > 0 && addDayUTC(shared[i - 1], 1) === shared[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** Most members free for `days` days in a row, on any dates. */
export function mostFreeFor(lists: string[][], days: number): number {
  const sets = lists.map((l) => new Set(l));
  let best = 0;
  for (const start of new Set(lists.flat())) {
    const window = Array.from({ length: days }, (_, i) => addDayUTC(start, i));
    best = Math.max(best, sets.filter((s) => window.every((d) => s.has(d))).length);
  }
  return best;
}

export function groupLimits(req: TripOptionsRequest): GroupLimits {
  const budgets = req.members.map((m) => m.dailyBudget).filter((b): b is number => b != null && b > 0);
  const lists = (req.freeDates ?? []).filter((l) => l.length > 0);
  return {
    dailyBudget: budgets.length ? Math.min(...budgets) : null,
    halal: req.members.some((m) => m.foodNeeds.includes('Halal')),
    noGos: [...new Set(req.members.map((m) => m.noGo).filter((n): n is string => !!n))],
    answered: lists.length,
    sharedRun: lists.length ? longestSharedRun(lists) : null,
    bestFree: lists.length ? mostFreeFor(lists, req.lengthMin) : null,
  };
}

/** Everything about this option that doesn't fit the group, in plain words (empty = fits everyone). */
export function optionProblems(o: TripOptionDraft, limits: GroupLimits): string[] {
  const problems: string[] = [];
  if (limits.dailyBudget != null && o.costPerPerson > limits.dailyBudget * o.days) {
    problems.push(`"${o.name}" costs RM ${o.costPerPerson} but must be at most RM ${limits.dailyBudget * o.days} (RM ${limits.dailyBudget} a day × ${o.days} days)`);
  }
  if (limits.sharedRun != null && o.days > limits.sharedRun) {
    problems.push(`"${o.name}" is ${o.days} days but everyone is only free ${limits.sharedRun} day${limits.sharedRun === 1 ? '' : 's'} in a row`);
  }
  if (limits.halal && !o.halal) problems.push(`"${o.name}" has no easy halal food`);
  const noGo = o.avoids.filter((a) => limits.noGos.includes(a));
  if (noGo.length) problems.push(`"${o.name}" involves a no-go: ${noGo.join(', ')}`);
  return problems;
}

/** Short reason the options can't fit everyone, or null when they all do. */
export function fitNote(options: TripOptionDraft[], limits: GroupLimits, req: TripOptionsRequest): string | null {
  const misfits = options.filter((o) => optionProblems(o, limits).length > 0);
  if (options.length && misfits.length === 0) return null;
  const reasons: string[] = [];
  const n = limits.answered;
  if (limits.bestFree != null && limits.sharedRun != null && limits.sharedRun < req.lengthMin) {
    if (n <= 1) reasons.push(`Your free dates don't have ${req.lengthMin} days in a row`);
    else if (limits.bestFree === 0) reasons.push(`No dates suit all ${n} yet`);
    else reasons.push(`No dates suit all ${n}, these suit ${limits.bestFree} of ${n}`);
  }
  const over = (o: TripOptionDraft) => limits.dailyBudget != null && o.costPerPerson > limits.dailyBudget * o.days;
  if (options.length && options.every(over)) {
    reasons.push(`No trip fits the lowest budget (RM ${limits.dailyBudget} a day), these are the closest`);
  } else if (options.some(over)) {
    reasons.push(`Some trips are over the lowest budget (RM ${limits.dailyBudget} a day)`);
  }
  if (limits.halal && options.some((o) => !o.halal)) reasons.push('Not every trip has easy halal food');
  if (options.some((o) => o.avoids.some((a) => limits.noGos.includes(a)))) reasons.push("Some trips include someone's no-go");
  return reasons.length ? reasons.join('. ') : null;
}

export function buildOptionsPrompt(req: TripOptionsRequest, limits: GroupLimits, sharedDates: string[], feedback?: string): string {
  const where = req.destination
    ? `The group already chose the destination: ${req.destination}. Give ${MIN_OPTIONS} or ${MAX_OPTIONS} different styles of trip there (e.g. highlights, easy pace, budget, food-focused). Each name must include "${req.destination}".`
    : `The group has not chosen a destination. Suggest ${MIN_OPTIONS} or ${MAX_OPTIONS} different destinations reachable from Malaysia (Malaysia, Singapore, Thailand, Indonesia etc.). Each name is just the place, e.g. "Penang".`;
  const maxDays = limits.sharedRun != null && limits.sharedRun >= req.lengthMin ? Math.min(req.lengthMax, limits.sharedRun) : req.lengthMax;
  const when = sharedDates.length
    ? `Dates everyone is free: ${sharedDates.join(', ')} (longest run: ${limits.sharedRun} days).`
    : 'No dates suit everyone yet.';
  const members = req.members
    .map(
      (m, i) =>
        `Member ${i + 1}: daily budget ${m.dailyBudget != null ? `RM ${m.dailyBudget}` : 'not set'}; food needs: ${m.foodNeeds.join(', ') || 'none'}; must-haves: ${m.mustHaves.join(', ') || 'none'}; no-go: ${m.noGo ?? 'none'}.`,
    )
    .join('\n');
  const hard = [
    limits.dailyBudget != null
      ? `"costPerPerson" must be at most RM ${limits.dailyBudget} × days (the lowest daily budget), e.g. at most RM ${limits.dailyBudget * maxDays} for ${maxDays} days.`
      : null,
    `"days" from ${req.lengthMin} to ${maxDays}${maxDays < req.lengthMax ? ', because that is how long everyone is free in a row' : ''}.`,
    limits.halal ? 'Someone needs halal food: only places with easy halal food, "halal": true.' : null,
    limits.noGos.length ? `Nobody may be forced into a no-go: ${limits.noGos.join(', ')}. "avoids" must not contain these.` : null,
  ].filter(Boolean);

  return `You plan group trips for a travel app used in Malaysia. Prices are in Malaysian ringgit (RM).

${where}
Trip length: ${req.lengthMin === req.lengthMax ? `${req.lengthMax} days` : `${req.lengthMin} to ${req.lengthMax} days`}.
${when}

What each member answered:
${members}

Every option MUST fit everyone:
${hard.map((h) => `- ${h}`).join('\n')}
If that is truly impossible, give the closest options you can.

Also:
- Cover as many must-haves as possible. Options must be clearly different from each other.
- "costPerPerson": realistic total in RM per person for the whole trip (stay, food, transport within the place, activities), excluding flights.
- "tags": 3 short labels (1–2 words each) shown on the card.
- "covers": which of these the trip offers, using these exact words only: ${MUST_HAVES.join(', ')}.
- "avoids": which of these no-gos the trip would force on people, exact words only: ${NO_GOS.join(', ')}. Empty if none.
- "scene": the drawing for the card, one of: ${SCENES.join(', ')}.
- "dayTitles": one short title per day (exactly "days" titles), e.g. "Penang Hill & George Town".
- "landmark": one well-known landmark or area of this trip that Google Maps can find, with the city, e.g. "Kek Lok Si Temple, Penang".
${feedback ? `\nYour last answer had problems:\n${feedback}\nFix them.\n` : ''}
Reply with JSON only, no other text, in this shape:
{"options":[{"name":"","days":3,"costPerPerson":400,"tags":[],"covers":[],"avoids":[],"halal":true,"scene":"temple","dayTitles":[],"landmark":""}]}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []);

/** Check Gemini's answer and tidy it to the trip's rules. Throws a plain reason if it can't be used. */
export function parseOptions(text: string, req: TripOptionsRequest): TripOptionDraft[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The answer was not valid JSON.');
  }
  if (!isRecord(raw) || !Array.isArray(raw.options)) throw new Error('The answer needs an "options" list.');
  const list = raw.options.filter(isRecord);
  if (list.length < MIN_OPTIONS) throw new Error(`Give at least ${MIN_OPTIONS} options.`);
  return list.slice(0, MAX_OPTIONS).map((o) => {
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 60) : null;
    if (!name) throw new Error('Every option needs a name.');
    const rawDays = typeof o.days === 'number' ? Math.round(o.days) : NaN;
    const cost = typeof o.costPerPerson === 'number' ? o.costPerPerson : NaN;
    if (!(rawDays >= 1 && rawDays <= 14)) throw new Error(`"${name}" needs "days" as a whole number.`);
    if (!(cost > 0 && cost < 100000)) throw new Error(`"${name}" needs "costPerPerson" in RM.`);
    const days = Math.min(req.lengthMax, Math.max(req.lengthMin, rawDays));
    const dayTitles = strings(o.dayTitles);
    if (dayTitles.length < days) throw new Error(`"${name}" has ${dayTitles.length} day titles for ${days} days.`);
    const tags = strings(o.tags);
    if (tags.length === 0) throw new Error(`"${name}" needs tags.`);
    return {
      name,
      days,
      costPerPerson: Math.round(cost / 10) * 10,
      tags: tags.slice(0, 3),
      // Keep only the app's own words so the fit checks can match them.
      covers: strings(o.covers).filter((c) => MUST_HAVES.includes(c)),
      avoids: strings(o.avoids).filter((a) => NO_GOS.includes(a)),
      halal: o.halal === true,
      scene: SCENES.includes(o.scene as SceneKind) ? (o.scene as SceneKind) : 'city',
      dayTitles: dayTitles.slice(0, days),
      landmark: typeof o.landmark === 'string' && o.landmark.trim() ? o.landmark.trim().slice(0, 100) : name,
    };
  });
}

/** Dates every member who answered is free on. */
export function commonFreeDates(lists: string[][]): string[] {
  if (lists.length === 0) return [];
  return lists[0].filter((d) => lists.every((l) => l.includes(d))).sort();
}

const misfitCount = (options: TripOptionDraft[], limits: GroupLimits) =>
  options.filter((o) => optionProblems(o, limits).length > 0).length;

/** One photo per option, from its landmark (cache first; options that have a photo are skipped). */
async function addPhotos(options: TripOptionDraft[], deps: OptionsDeps) {
  let calls = 0;
  if (!deps.findPhoto) return { options, calls };
  const out = await Promise.all(
    options.map(async (o) => {
      if (o.photo || !o.landmark) return o;
      try {
        const found = await deps.findPhoto!(o.landmark);
        calls += found.calls;
        const p = found.value;
        return {
          ...o,
          placeId: p?.placeId ?? null,
          photo: p ? { url: p.url, credit: p.credit, creditUrl: p.creditUrl } : null,
          photoLimited: found.limited,
        };
      } catch (e) {
        deps.log?.(`Photo lookup failed for "${o.landmark}": ${e instanceof Error ? e.message : e}`);
        return { ...o, photo: null };
      }
    }),
  );
  return { options: out, calls };
}

/**
 * The whole flow: Gemini, checked against the group's budget, shared dates,
 * food needs and no-gos. If an option doesn't fit, Gemini gets one retry with
 * the problems; the better answer is kept, fitting options first, with a short
 * note when they can't all fit. Falls back to the sample options. Never throws.
 */
export async function planTripOptions(req: TripOptionsRequest, deps: OptionsDeps): Promise<TripOptionsResponse> {
  const limits = groupLimits(req);
  const shared = commonFreeDates((req.freeDates ?? []).filter((l) => l.length > 0));
  let best: TripOptionDraft[] | null = null;
  let reason = 'GEMINI_API_KEY is not set';
  if (deps.ask) {
    let feedback: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const options = parseOptions(await deps.ask(buildOptionsPrompt(req, limits, shared, feedback), attempt), req);
        if (!best || misfitCount(options, limits) < misfitCount(best, limits)) best = options;
        const problems = options.flatMap((o) => optionProblems(o, limits));
        if (problems.length === 0) break;
        feedback = problems.map((p) => `- ${p}`).join('\n');
        deps.log?.(`generate-trip-options attempt ${attempt + 1}: ${problems.length} problem(s)`);
      } catch (e) {
        reason = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        feedback = reason;
        deps.log?.(`generate-trip-options attempt ${attempt + 1} failed: ${reason}`);
      }
    }
  }
  const source: TripOptionsResponse['source'] = best ? 'ai' : 'sample';
  const chosen = best ?? sampleTripOptions(req);
  // Options that fit everyone first; the rest by how many things don't fit.
  const ordered = chosen
    .map((o, i) => ({ o, i, n: optionProblems(o, limits).length }))
    .sort((a, b) => a.n - b.n || a.i - b.i)
    .map((x) => x.o);
  const withPhotos = await addPhotos(ordered, deps);
  return {
    options: withPhotos.options,
    source,
    note: fitNote(ordered, limits, req),
    ...(source === 'sample' ? { reason } : {}),
    googleCalls: withPhotos.calls,
  };
}
