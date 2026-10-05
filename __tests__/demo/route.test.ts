import { buildDemoRoute, demoDays, demoTravelMin, FAR_M, pickDemoDay, type RouteStop } from '@/features/demo/route';
import { centroid, haversineMeters } from '@/lib/distance';
import { eventsAround, rainSoonAt, sampleRoute, type DemoRoute } from '@/lib/location';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const MIN = 60_000;
const at = (day: number, h: number, m = 0) => new Date(2026, 9, 11 + day, h, m).toISOString();

let n = 0;
function stop(day: number, name: string, lat: number | null, lng: number | null, from: string, to: string | null, extra: Partial<RouteStop> = {}): RouteStop {
  n += 1;
  return {
    id: `s${n}`,
    name,
    day_number: day,
    position: n,
    lat,
    lng,
    planned_time: from,
    planned_end: to,
    is_outdoor: false,
    status: 'planned',
    ...extra,
  };
}

// A Penang day with real coordinates.
const stops: RouteStop[] = [
  stop(1, 'Toh Soon Cafe', 5.4176, 100.3332, at(1, 8, 30), at(1, 9, 15)),
  stop(1, 'Penang Hill', 5.4249, 100.269, at(1, 10), at(1, 12), { is_outdoor: true }),
  stop(1, 'Gurney Drive hawkers', 5.438, 100.31, at(1, 12, 45), at(1, 13, 45)),
  stop(1, 'Kek Lok Si', 5.3998, 100.2734, at(1, 14, 30), at(1, 16), { is_outdoor: true }),
  stop(1, 'Armenian Street murals', 5.4152, 100.3376, at(1, 17), at(1, 18, 30), { is_outdoor: true }),
  stop(1, 'Dropped stop', 5.41, 100.33, at(1, 11), null, { status: 'dropped' }),
  stop(1, 'No place yet', null, null, at(1, 19), null),
  stop(2, 'Clan Jetties', 5.4128, 100.3407, at(2, 9), at(2, 10), { is_outdoor: true }),
];
const day1 = stops.slice(0, 5);
const members = [
  { id: 'm-me', name: 'Harein' },
  { id: 'm-2', name: 'Priya' },
];

const build = (s = stops, m = members): DemoRoute => buildDemoRoute({ tripId: 't1', day: 1, stops: s, members: m, meId: 'm-me' })!;
const event = (r: DemoRoute, kind: string) => r.events.find((e) => e.kind === kind)!;
const stopOf = (id?: string) => stops.find((s) => s.id === id)!;
const pos = (s: RouteStop) => ({ lat: s.lat!, lng: s.lng! });

describe('buildDemoRoute', () => {
  const route = build();

  it('walks the Day plan stop to stop, skipping dropped and unplaced stops', () => {
    const arrivals = route.events.filter((e) => e.kind === 'arrive').map((e) => e.stopId);
    expect(arrivals).toEqual(day1.map((s) => s.id));
    for (const e of route.events.filter((x) => x.kind === 'arrive')) {
      const me = sampleRoute(route, e.at).me!;
      expect(haversineMeters(me, pos(stopOf(e.stopId)))).toBeLessThan(100);
    }
  });

  it('starts 30 min before the first stop and keeps time moving forward', () => {
    expect(route.startsAt).toBe(Date.parse(day1[0].planned_time!) - 30 * MIN);
    route.group.forEach((f, i) => i > 0 && expect(f.t).toBeGreaterThanOrEqual(route.group[i - 1].t));
    route.events.forEach((e, i) => i > 0 && expect(e.at).toBeGreaterThanOrEqual(route.events[i - 1].at));
  });

  it('arrives late at one stop, and the late warning comes before it starts', () => {
    const late = event(route, 'late');
    const target = stopOf(late.stopId);
    const startsAt = Date.parse(target.planned_time!);
    const arrival = route.events.find((e) => e.kind === 'arrive' && e.stopId === target.id)!;
    expect(arrival.at - startsAt).toBeGreaterThan(5 * MIN);
    expect(arrival.title).toMatch(/min late/);
    // An early warning: before the planned start, while still at the stop before.
    expect(late.at).toBeLessThan(startsAt);
    const before = day1[day1.findIndex((s) => s.id === target.id) - 1];
    expect(haversineMeters(sampleRoute(route, late.at).me!, pos(before))).toBeLessThan(100);
    // Running-late rule with the replay's own travel time: now + travel > planned time + 5 min.
    expect(late.at + demoTravelMin(route, target.id, late.at)! * MIN).toBeGreaterThan(startsAt + 5 * MIN);
  });

  it('leaves one stop more than 20 min before its planned end', () => {
    const early = event(route, 'early');
    const s = stopOf(early.stopId);
    expect(early.at).toBeLessThan(Date.parse(s.planned_end!) - 20 * MIN);
    expect(haversineMeters(sampleRoute(route, early.at).me!, pos(s))).toBeLessThan(100);
    expect(haversineMeters(sampleRoute(route, early.at + 15 * MIN).me!, pos(s))).toBeGreaterThan(150);
  });

  it('brings rain within the hour near an outdoor stop', () => {
    const rain = event(route, 'rain');
    expect(stopOf(rain.stopId).is_outdoor).toBe(true);
    expect(sampleRoute(route, rain.at).rainSoon).toBe(true);
    expect(sampleRoute(route, route.startsAt).rainSoon).toBe(false);
    expect(rainSoonAt(route, { lat: 3.139, lng: 101.6869 }, rain.at)).toBe(false); // Kuala Lumpur stays dry
  });

  it('sends one member 900 m from the group with low battery, then back', () => {
    const far = event(route, 'far');
    const away = sampleRoute(route, far.at);
    const drifter = away.members.find((m) => m.id === far.memberId)!;
    const rest = centroid(away.members.filter((m) => m.id !== drifter.id))!;
    expect(drifter.isMe).toBe(false);
    expect(Math.abs(haversineMeters(drifter, rest) - FAR_M)).toBeLessThan(20);
    expect(haversineMeters(drifter, away.center)).toBeGreaterThan(500); // the far-from-group rule
    expect(drifter.battery).toBeLessThan(15);

    const back = sampleRoute(route, event(route, 'rejoin').at);
    const again = back.members.find((m) => m.id === drifter.id)!;
    expect(haversineMeters(again, back.center)).toBeLessThan(50);
  });

  it('keeps everyone else near the group with a healthy battery', () => {
    for (const e of route.events) {
      const loc = sampleRoute(route, e.at);
      for (const m of loc.members.filter((x) => x.id !== event(route, 'far').memberId)) {
        expect(haversineMeters(m, loc.center)).toBeLessThan(500);
        expect(m.battery).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('pads a small group with made-up friends and marks this phone', () => {
    expect(route.members).toHaveLength(4);
    expect(route.members.filter((m) => m.fake)).toHaveLength(2);
    expect(route.members.find((m) => m.isMe)?.id).toBe('m-me');
    const solo = build(stops, []);
    expect(solo.members.find((m) => m.isMe)?.id).toBe('m-me');
    expect(solo.members).toHaveLength(4);
  });

  it('points Next event at the next day once this one is over', () => {
    expect(route.nextDayStartsAt).toBe(Date.parse(at(2, 9)) - 30 * MIN);
    expect(eventsAround(route, route.endsAt + 1).next).toBeNull();
    expect(eventsAround(route, route.startsAt).last?.kind).toBe('start');
  });

  it('still has all four moments with a single stop', () => {
    const one = build([stop(1, 'Fort Cornwallis', 5.4206, 100.3438, at(1, 9), at(1, 10, 30), { is_outdoor: true })]);
    expect(one.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['late', 'early', 'rain', 'far']));
  });

  it('is null for a day with no placed, timed stops', () => {
    expect(buildDemoRoute({ tripId: 't1', day: 3, stops, members, meId: 'm-me' })).toBeNull();
  });
});

describe('pickDemoDay', () => {
  it('replays Day 1 first, then the day whose replay has started', () => {
    expect(demoDays(stops).map((d) => d.day)).toEqual([1, 2]);
    expect(pickDemoDay(stops, null)).toBe(1);
    expect(pickDemoDay(stops, Date.parse(at(1, 23)))).toBe(1);
    expect(pickDemoDay(stops, Date.parse(at(2, 8, 45)))).toBe(2);
    expect(pickDemoDay(stops, Date.parse(at(0, 9)))).toBe(1);
    expect(pickDemoDay([], null)).toBeNull();
  });
});
