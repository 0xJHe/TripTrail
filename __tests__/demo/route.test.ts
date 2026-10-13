import { buildDemoRoute, demoDays, demoTravelMin, FAR_M, pickDemoDay, type RouteStop } from '@/features/demo/route';
import { mainPlan } from '@/features/group/splitStops';
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
    // The event is where the leave is noticed: 150 m out for 3 min already.
    expect(haversineMeters(sampleRoute(route, early.at - 15 * MIN).me!, pos(s))).toBeLessThan(100);
    for (const t of [early.at - 3 * MIN, early.at]) expect(haversineMeters(sampleRoute(route, t).me!, pos(s))).toBeGreaterThan(150);
  });

  it('gives the rain card its own tap, not the early leave one', () => {
    const rain = event(route, 'rain');
    const before = route.events.filter((e) => e.at < rain.at);
    expect(before[before.length - 1].kind).toBe('early');
    expect(sampleRoute(route, before[before.length - 1].at).rainSoon).toBe(false);
    expect(sampleRoute(route, rain.at).rainSoon).toBe(true);
  });

  it('keeps the member away for several "Next event" taps, back once the group is at the next stop', () => {
    const far = event(route, 'far');
    const rejoin = event(route, 'rejoin');
    const between = route.events.filter((e) => e.at > far.at && e.at < rejoin.at);
    expect(between.map((e) => e.kind)).toEqual(['leave', 'travel', 'arrive']);
    for (const e of [far, ...between]) {
      const loc = sampleRoute(route, e.at);
      const drifter = loc.members.find((m) => m.id === far.memberId)!;
      const rest = centroid(loc.members.filter((m) => m.id !== drifter.id))!;
      expect(haversineMeters(drifter, rest)).toBeGreaterThan(500);
    }
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

  it('keeps everyone else near the group, made-up friends with a healthy battery', () => {
    for (const e of route.events) {
      const loc = sampleRoute(route, e.at);
      for (const m of loc.members.filter((x) => x.id !== event(route, 'far').memberId)) {
        expect(haversineMeters(m, loc.center)).toBeLessThan(500);
        if (m.id.startsWith('demo-')) expect(m.battery).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it("shows real members' real phone battery, made-up friends a fake one", () => {
    const t = event(route, 'far').at;
    const loc = sampleRoute(route, t, { 'm-me': 77, 'm-2': 9 });
    expect(loc.members.find((m) => m.id === 'm-me')?.battery).toBe(77);
    expect(loc.members.find((m) => m.id === 'm-2')?.battery).toBe(9);
    // Not shared yet: unknown, never made up.
    expect(sampleRoute(route, t).members.find((m) => m.id === 'm-2')?.battery).toBeNull();
    expect(route.members.filter((m) => !m.fake).every((m) => m.battery.length === 0)).toBe(true);
  });

  it('sends a made-up friend off with low battery, the same one on every phone', () => {
    const other = buildDemoRoute({ tripId: 't1', day: 1, stops, members, meId: 'm-2' })!;
    expect(event(other, 'far').memberId).toBe(event(route, 'far').memberId);
    expect(route.members.find((m) => m.id === event(route, 'far').memberId)?.fake).toBe(true);
    expect(other.events.map((e) => [e.at, e.kind, e.title])).toEqual(route.events.map((e) => [e.at, e.kind, e.title]));
    // Everyone is in the same place on both phones; only "me" differs.
    const t = event(route, 'far').at;
    const strip = (r: DemoRoute) => sampleRoute(r, t).members.map(({ isMe: _isMe, ...m }) => m);
    expect(strip(other)).toEqual(strip(route));
    expect(other.members.find((m) => m.isMe)?.id).toBe('m-2');
  });

  it('still adds a made-up friend to wander off when the trip has 4+ members', () => {
    const big = [...members, { id: 'm-3', name: 'Ravi' }, { id: 'm-4', name: 'Siti' }];
    const r = build(stops, big);
    expect(r.members.filter((m) => !m.fake).map((m) => m.id)).toEqual(['m-me', 'm-2', 'm-3', 'm-4']);
    const drifter = r.members.find((m) => m.id === event(r, 'far').memberId)!;
    expect(drifter.fake).toBe(true);
    expect(sampleRoute(r, event(r, 'far').at).members.find((m) => m.id === drifter.id)!.battery).toBeLessThan(15);
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
    // One stop: the day starts right at it.
    expect(haversineMeters(one.group[0], { lat: 5.4206, lng: 100.3438 })).toBeLessThan(1);
  });

  it('starts from the side of the day\'s other stops, never a fixed direction', () => {
    const fort = { lat: 5.4206, lng: 100.3438 };
    for (const [dLat, dLng] of [[0.01, 0], [-0.01, 0], [0, 0.01], [0, -0.01]]) {
      const other = { lat: fort.lat + dLat, lng: fort.lng + dLng };
      const r = build([
        stop(1, 'Fort Cornwallis', fort.lat, fort.lng, at(1, 9), at(1, 10)),
        stop(1, 'Elsewhere', other.lat, other.lng, at(1, 11), at(1, 12)),
      ]);
      const out = haversineMeters(fort, r.group[0]);
      expect(out).toBeCloseTo(800, 0);
      expect(haversineMeters(r.group[0], other)).toBeCloseTo(haversineMeters(fort, other) - 800, -1);
    }
  });

  it('starts closer in when the walk in would pass another stop', () => {
    // A stop 120 m off the line from the first stop towards the others, 500 m out.
    const r = build([
      stop(1, 'Fort Cornwallis', 5.4206, 100.3438, at(1, 9), at(1, 10)),
      stop(1, 'On the way', 5.4206 + 0.0011, 100.3438 - 0.0045, at(1, 11), at(1, 12)),
      stop(1, 'Far west', 5.4206, 100.3438 - 0.03, at(1, 13), at(1, 14)),
    ]);
    const start = r.group[0];
    const out = haversineMeters({ lat: 5.4206, lng: 100.3438 }, start);
    expect(out).toBeGreaterThanOrEqual(199);
    expect(out).toBeLessThan(500);
    expect(haversineMeters(start, { lat: 5.4206 + 0.0011, lng: 100.3438 - 0.0045 })).toBeGreaterThan(150);
  });

  it('marks every leave as a spend check, and really leaves each stop', () => {
    const left = route.events.filter((e) => e.kind === 'leave' || e.kind === 'early');
    expect(left.map((e) => e.stopId)).toEqual(day1.map((s) => s.id));
    for (const e of left) {
      expect(e.title).toMatch(/ · spend check/);
      // The group goes more than 150 m away afterwards (the last stop too), so the stop is left.
      const after = sampleRoute(route, e.at + 10 * MIN).me!;
      expect(haversineMeters(after, pos(stopOf(e.stopId)))).toBeGreaterThan(150);
    }
  });

  it('puts "On the way to [next]" between every leave and the next arrival', () => {
    const kinds = route.events
      .filter((e) => ['arrive', 'leave', 'early', 'travel'].includes(e.kind))
      .map((e) => (e.kind === 'early' ? 'leave' : e.kind));
    expect(kinds).toEqual(day1.flatMap((_, i) => (i === 0 ? ['arrive', 'leave'] : ['travel', 'arrive', 'leave'])));
    for (const e of route.events.filter((x) => x.kind === 'travel')) {
      expect(e.title).toBe(`On the way to ${stopOf(e.stopId).name}`);
    }
  });

  it("reaches the end of the day: the group walks off after the last stop, away from the other stops", () => {
    const last = day1[day1.length - 1];
    const leave = route.events.filter((e) => e.kind === 'leave').pop()!;
    expect(leave.stopId).toBe(last.id);
    expect(leave.title).toBe('Left Armenian Street murals · spend check');
    // Then the day-end event, last of the day, before "Next day".
    const end = route.events[route.events.length - 1];
    expect(end.kind).toBe('end');
    expect(end.at).toBeGreaterThan(leave.at);
    expect(end.at).toBeLessThan(route.endsAt);
    expect(eventsAround(route, end.at).next).toBeNull();
    // Still there at the planned end, gone (and out of range for 3+ min) well before the replay ends.
    expect(leave.at).toBeGreaterThanOrEqual(Date.parse(last.planned_end!));
    expect(route.endsAt).toBeGreaterThanOrEqual(leave.at + 20 * MIN);
    for (const t of [leave.at + 5 * MIN, leave.at + 10 * MIN, route.endsAt]) {
      const me = sampleRoute(route, t).me!;
      expect(haversineMeters(me, pos(last))).toBeGreaterThan(150);
      for (const s of day1) expect(haversineMeters(me, pos(s))).toBeGreaterThan(100);
    }
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

describe('buildDemoRoute with a group B stop (Split & rejoin)', () => {
  // Group B's own stop between Gurney Drive and Kek Lok Si; the moments come from the shared plan.
  const bStop = { ...stop(1, 'Penang Peranakan Mansion', 5.4183, 100.3375, at(1, 13, 50), at(1, 14, 10)), split_id: 'sp1' };
  const withB: (RouteStop & { split_id?: string | null })[] = [...stops, bStop];
  const route = buildDemoRoute({ tripId: 't1', day: 1, stops: withB, base: mainPlan(withB), members, meId: 'm-me' })!;

  it('walks group B through their own stop', () => {
    expect(route.events.some((e) => e.kind === 'arrive' && e.stopId === bStop.id)).toBe(true);
  });

  it('never puts the late, early or rain moment on it', () => {
    for (const kind of ['late', 'early', 'rain']) {
      expect(route.events.filter((e) => e.kind === kind).map((e) => e.stopId)).not.toContain(bStop.id);
    }
  });
});
