// Rain backup: when the card shows, which stop it's for, what "Go" sends, and that Demo
// mode's rain moment raises it. Fake weather only, no Google.
import { buildDemoRoute } from '@/features/demo/route';
import type { Stop } from '@/features/planning/types';
import { applyChanges, emptyTracker, processReadings, readingTimes } from '@/features/today/arrival';
import { rainOptionMeta } from '@/features/today/components/RainCard';
import {
  beforeRainSwaps,
  demoRainIn,
  openRainFor,
  rainAlertFor,
  rainHeadline,
  rainInMinutes,
  rainLeft,
  rainTarget,
  slotStart,
  swapTimes,
} from '@/features/today/rain';
import { todayView } from '@/features/today/todayPlan';
import type { RainAlert } from '@/features/today/types';
import { sampleRoute, type DemoRoute } from '@/lib/location';
import type { RainOption } from '@/supabase/functions/_shared/nearby';
import type { HourWeather, Weather } from '@/supabase/functions/_shared/weather';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');

const MIN = 60_000;
const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

let n = 0;
function stop(name: string, lat: number, lng: number, from: number, to: number, extra: Partial<Stop> = {}): Stop {
  n += 1;
  return {
    id: `s${n}`,
    trip_id: 't1',
    day_number: 1,
    position: n,
    name,
    address: null,
    lat,
    lng,
    planned_time: iso(from),
    planned_end: iso(to),
    price: 10,
    is_estimate: true,
    is_booked: false,
    is_outdoor: false,
    tip: null,
    status: 'planned',
    arrived_at: null,
    left_at: null,
    actual_cost: null,
    category: 'sight',
    priority: 2,
    note: null,
    place_id: null,
    ...extra,
  };
}

// Day 1 in Penang (the seed plan's real places).
const day = [
  stop('Roti canai at Transfer Road', 5.4196, 100.3327, at(8, 30), at(9, 15), { category: 'food' }),
  stop('Penang Hill funicular', 5.4239, 100.2691, at(9, 30), at(12), { is_outdoor: true, price: 15 }),
  stop('Nasi kandar at Line Clear', 5.4183, 100.3318, at(12, 30), at(13, 30), { category: 'food' }),
  stop('Armenian Street murals', 5.4151, 100.3376, at(14, 30), at(15, 30), { is_outdoor: true }),
  stop('Cheong Fatt Tze Blue Mansion', 5.4214, 100.3355, at(16), at(17), { price: 25 }),
  stop('Chulia Street street food', 5.4172, 100.3364, at(19), at(20), { category: 'food' }),
];
const [roti, funicular, lineClear, murals] = day;

const option = (id: string, name: string, extra: Partial<RainOption> = {}): RainOption => ({
  placeId: id,
  name,
  lat: 5.4159,
  lng: 100.3371,
  kind: 'Museum',
  category: 'sight',
  distanceM: 120,
  walkMin: 2,
  ride: false,
  price: 10,
  halalNote: false,
  mustHave: null,
  ...extra,
});
const museum = option('p-museum', 'Penang Peranakan Museum');

const rainRow = (stopId: string, extra: Partial<RainAlert> = {}): RainAlert => ({
  stop_id: stopId,
  trip_id: 't1',
  day_number: 1,
  checked_at: iso(at(13, 50)),
  rain_in_min: 40,
  options: [museum],
  status: 'open',
  picked: null,
  added_stop_id: null,
  original: null,
  decided_by: null,
  decided_at: null,
  ...extra,
});

const arrived = (s: Stop, when: number): Stop => ({ ...s, status: 'arrived', arrived_at: iso(when) });

describe('rainTarget', () => {
  it('the stop the group is at, if outdoor and still on when the rain comes', () => {
    const now = arrived(funicular, at(9, 35));
    expect(rainTarget({ now, next: lineClear, time: at(10), rainIn: 40, rainAlerts: [] })?.id).toBe(funicular.id);
    // Raining already counts too.
    expect(rainTarget({ now, next: lineClear, time: at(10), rainIn: 0, rainAlerts: [] })?.id).toBe(funicular.id);
    // They leave before it comes: nothing to change.
    expect(rainTarget({ now, next: lineClear, time: at(11, 40), rainIn: 30, rainAlerts: [] })).toBeNull();
  });

  it('else the next stop, if outdoor and it starts within an hour of the rain', () => {
    const now = arrived(lineClear, at(12, 30));
    expect(rainTarget({ now, next: murals, time: at(13, 20), rainIn: 40, rainAlerts: [] })?.id).toBe(murals.id);
    // 14:30 start, rain at 12:40: more than an hour after the rain comes.
    expect(rainTarget({ now, next: murals, time: at(12, 30), rainIn: 10, rainAlerts: [] })).toBeNull();
    // On the way (no stop now) it's the same.
    expect(rainTarget({ now: null, next: murals, time: at(13, 50), rainIn: 25, rainAlerts: [] })?.id).toBe(murals.id);
  });

  it('no rain, indoor stops, booked stops, a stop with a card already: nothing', () => {
    const now = arrived(lineClear, at(12, 30));
    expect(rainTarget({ now, next: murals, time: at(13, 50), rainIn: null, rainAlerts: [] })).toBeNull();
    expect(rainTarget({ now: arrived(roti, at(8, 30)), next: lineClear, time: at(8, 40), rainIn: 5, rainAlerts: [] })).toBeNull();
    const booked = { ...murals, is_booked: true };
    expect(rainTarget({ now, next: booked, time: at(13, 50), rainIn: 25, rainAlerts: [] })).toBeNull();
    expect(rainTarget({ now, next: murals, time: at(13, 50), rainIn: 25, rainAlerts: [{ stop_id: murals.id }] })).toBeNull();
  });
});

describe('rain within the hour', () => {
  const cloudy: Weather = { tempC: 30, condition: 'cloudy', kind: 'cloudy', windKmh: 5, isDay: true, rainChance: 20 };
  const hour = (startMs: number, w: Partial<Weather>): HourWeather => ({ ...cloudy, ...w, start: iso(startMs), end: iso(startMs + 60 * MIN) });

  it('real mode: from the weather already fetched (current + the hours ahead)', () => {
    const soon = [hour(at(13), {}), hour(at(14), { kind: 'rain', condition: 'showers' })];
    expect(rainInMinutes({ route: null, center: null, time: at(13, 20), weather: { now: cloudy, soon } })).toBe(40);
    expect(rainInMinutes({ route: null, center: null, time: at(12, 50), weather: { now: cloudy, soon } })).toBeNull();
    expect(rainInMinutes({ route: null, center: null, time: at(13, 20), weather: null })).toBeNull();
  });

  it("Demo mode: the route's rain moment at the group's position, ignoring the real weather", () => {
    const route = { rain: [{ lat: murals.lat!, lng: murals.lng!, radiusM: 3000, startsAt: at(14, 40), endsAt: at(15, 40) }] } as DemoRoute;
    const here = { lat: lineClear.lat!, lng: lineClear.lng! };
    expect(demoRainIn(route, here, at(14))).toBe(40);
    expect(demoRainIn(route, here, at(15))).toBe(0);
    expect(demoRainIn(route, here, at(13, 30))).toBeNull(); // more than an hour away
    expect(demoRainIn(route, { lat: 5.47, lng: 100.25 }, at(14))).toBeNull(); // outside the rain
    expect(rainInMinutes({ route, center: here, time: at(14), weather: { now: { ...cloudy, kind: 'rain' } } })).toBe(40);
  });
});

describe('the rain card', () => {
  it('is saved once per outdoor stop with its options', () => {
    expect(rainAlertFor({ tripId: 't1', stop: murals, now: at(13, 50), rainIn: 40, options: [museum] })).toEqual({
      stop_id: murals.id,
      trip_id: 't1',
      day_number: 1,
      checked_at: iso(at(13, 50)),
      rain_in_min: 40,
      options: [museum],
    });
  });

  it('shows for the stop the group is at, else the next one, while open', () => {
    const now = arrived(lineClear, at(12, 30));
    expect(openRainFor([rainRow(murals.id)], now, murals)?.stop.id).toBe(murals.id);
    expect(openRainFor([rainRow(murals.id, { status: 'kept' })], now, murals)).toBeNull();
    const there = arrived(murals, at(14, 30));
    expect(openRainFor([rainRow(murals.id)], there, null)?.stop.id).toBe(murals.id);
  });

  it('counts down, with a plain headline (and one for nothing found)', () => {
    const row = rainRow(murals.id);
    expect(rainLeft(row, at(14))).toBe(30);
    expect(rainLeft(row, at(15))).toBe(0);
    expect(rainHeadline('Batu Ferringhi beach', 40, true)).toBe('Rain at Batu Ferringhi beach in 40 min');
    expect(rainHeadline('Batu Ferringhi beach', 75, true)).toBe('Rain at Batu Ferringhi beach in 1 h 15 min');
    expect(rainHeadline('Batu Ferringhi beach', 0, true)).toBe('Rain at Batu Ferringhi beach now');
    expect(rainHeadline('Batu Ferringhi beach', 40, false)).toBe('Rain coming at Batu Ferringhi beach — consider moving it');
  });

  it('options show the walk or ride, and a rough price', () => {
    expect(rainOptionMeta(museum)).toBe('2 min walk · ~RM 10');
    expect(rainOptionMeta(option('p-mall', 'Gurney Plaza', { walkMin: 12, ride: true, price: 0 }))).toBe('12 min ride · Free');
  });

  it('restaurants are judged at the time the place would start', () => {
    expect(slotStart(murals, at(13, 50))).toBe(at(14, 30));
    expect(slotStart(arrived(murals, at(14, 30)), at(14, 40))).toBe(at(14, 40));
  });
});

describe('Go', () => {
  it('a stop still to come keeps its time slot (the stop itself becomes the place)', () => {
    expect(swapTimes({ stop: murals, option: museum, here: lineClear as never, now: at(13, 50) })).toEqual({
      now: iso(at(13, 50)),
      start: null,
      end: null,
    });
  });

  it('at the stop already: it ends now, the place takes the rest of its slot', () => {
    const there = arrived(murals, at(14, 30));
    const here = { lat: murals.lat!, lng: murals.lng! };
    const t = swapTimes({ stop: there, option: museum, here, now: at(14, 40) });
    expect(t.now).toBe(iso(at(14, 40)));
    expect(Date.parse(t.start!)).toBeGreaterThan(at(14, 40));
    expect(t.end).toBe(murals.planned_end);
    // Almost over: still at least 15 min there.
    const late = swapTimes({ stop: there, option: museum, here, now: at(15, 25) });
    expect(Date.parse(late.end!) - Date.parse(late.start!)).toBe(15 * MIN);
  });
});

describe("demo route's rain moment", () => {
  /** Stops after replaying a route up to t, like useVisitTracker (a reading every 30 s). */
  const replay = (r: DemoRoute, stops: Stop[], t: number) => {
    const readings = readingTimes(r.startsAt - 30_000, t, 30_000).map((x) => {
      const loc = sampleRoute(r, x);
      return { ...(loc.me ?? loc.center), at: x };
    });
    return applyChanges(stops, processReadings(emptyTracker(), stops, readings).changes);
  };

  /** What useRainCheck sees at time t. */
  const check = (r: DemoRoute, stops: Stop[], t: number, alerts: RainAlert[] = []) => {
    const now = replay(r, stops, t);
    const view = todayView({ stage: 'decided', start: '2026-10-12', days: 1, stops: now, now: new Date(t) });
    if (view.kind !== 'day') throw new Error('expected a day');
    const rainIn = rainInMinutes({ route: r, center: sampleRoute(r, t).center, time: t, weather: null });
    return { rainIn, target: rainTarget({ now: view.now, next: view.next, time: t, rainIn, rainAlerts: alerts }) };
  };

  const route = buildDemoRoute({ tripId: 't1', day: 1, stops: day, members: [], meId: 'me' })!;
  const rain = route.events.find((e) => e.kind === 'rain')!;

  it('is at an outdoor stop', () => {
    expect(day.find((s) => s.id === rain.stopId)?.is_outdoor).toBe(true);
  });

  it('raises the rain card for that stop at the "Next event" moment', () => {
    const c = check(route, day, rain.at);
    expect(c.rainIn).not.toBeNull();
    expect(c.rainIn!).toBeGreaterThan(0);
    expect(c.rainIn!).toBeLessThanOrEqual(60);
    expect(c.target?.id).toBe(rain.stopId);
  });

  it('once per stop: with its card saved, no second one', () => {
    expect(check(route, day, rain.at, [rainRow(rain.stopId!)]).target).toBeNull();
  });

  it('no card at the start of the day, before any rain is near', () => {
    expect(check(route, day, route.startsAt + 5 * MIN).target).toBeNull();
  });

  it('after Go, the day keeps its moments (the replay walks to the swapped-in place)', () => {
    const swappedStop = day.find((s) => s.id === rain.stopId)!;
    const swapped = day.map((s) =>
      s.id === swappedStop.id ? { ...s, name: museum.name, lat: museum.lat, lng: museum.lng, is_outdoor: false } : s,
    );
    const alerts = [
      rainRow(swappedStop.id, {
        status: 'swapped',
        picked: museum,
        original: {
          name: swappedStop.name,
          address: null,
          lat: swappedStop.lat,
          lng: swappedStop.lng,
          place_id: null,
          price: 10,
          is_estimate: true,
          is_outdoor: true,
          category: 'sight',
          tip: null,
          note: null,
          status: 'planned',
          left_at: null,
          planned_end: swappedStop.planned_end,
        },
      }),
    ];
    const base = beforeRainSwaps(swapped, alerts);
    expect(base.find((s) => s.id === swappedStop.id)).toMatchObject({ is_outdoor: true, lat: swappedStop.lat });
    const again = buildDemoRoute({ tripId: 't1', day: 1, stops: swapped, base, members: [], meId: 'me' })!;
    const kinds = ['late', 'early', 'rain'] as const;
    for (const k of kinds) {
      expect(again.events.find((e) => e.kind === k)?.stopId).toBe(route.events.find((e) => e.kind === k)?.stopId);
    }
  });

  it('beforeRainSwaps leaves out a stop added when the group was already there', () => {
    const added = stop('Indoor place', museum.lat, museum.lng, at(14, 45), at(15, 30));
    const ended = { ...murals, status: 'done' as const, planned_end: iso(at(14, 40)) };
    const alerts = [
      rainRow(murals.id, {
        status: 'swapped',
        added_stop_id: added.id,
        original: {
          name: murals.name,
          address: null,
          lat: murals.lat,
          lng: murals.lng,
          place_id: null,
          price: 10,
          is_estimate: true,
          is_outdoor: true,
          category: 'sight',
          tip: null,
          note: null,
          status: 'arrived',
          left_at: null,
          planned_end: murals.planned_end,
        },
      }),
    ];
    const base = beforeRainSwaps([...day.filter((s) => s.id !== murals.id), ended, added], alerts);
    expect(base.some((s) => s.id === added.id)).toBe(false);
    expect(base.find((s) => s.id === murals.id)?.planned_end).toBe(murals.planned_end);
    expect(beforeRainSwaps(day, [rainRow(murals.id, { status: 'kept' })])).toBe(day);
  });
});
