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
