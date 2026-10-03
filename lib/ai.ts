// AI trip options. For now this returns sample data built from everyone's answers.
// Later it will call the Vercel function api/generate-trip-options (Gemini), validate
// the JSON with zod, retry once, and fall back to this sample data on failure.

/** Picture drawn at the top of an option card. */
export type SceneKind = 'temple' | 'island' | 'city' | 'heritage' | 'highlands' | 'beach';

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
    };
  });
}

export function sampleTripOptions(req: TripOptionsRequest): TripOptionDraft[] {
  const destination = req.destination?.trim();
  return destination ? sampleStyles(destination, req) : samplePlaces(req);
}

/** Trip options from everyone's answers. Sample data for now (Gemini comes later). */
export async function generateTripOptions(req: TripOptionsRequest): Promise<TripOptionDraft[]> {
  return sampleTripOptions(req);
}
