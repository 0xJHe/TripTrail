import { buildDemoRoute } from '@/features/demo/route';
import { farMembers, type MapMember } from '@/features/group/groupMap';
import {
  bothGroupsHere,
  countdownText,
  currentGathering,
  etaText,
  etaTo,
  everyoneHere,
  groupAPlan,
  meetDirectionsUrl,
  nameForSpot,
  pickRejoin,
  splitTitle,
} from '@/features/group/meetPoint';
import type { MeetPointRow } from '@/features/group/types';
import type { Stop } from '@/features/planning/types';
import { offsetMeters } from '@/lib/distance';
import { sampleRoute } from '@/lib/location';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const MIN = 60_000;
const base = { lat: 5.4172, lng: 100.3364 };
const T = new Date(2026, 9, 12, 14, 0).getTime();
const at = (east: number, north = 0) => offsetMeters(base, east, north);
const iso = (ms: number) => new Date(ms).toISOString();

function stop(id: string, startMs: number, east: number, extra: Partial<Stop> = {}): Stop {
  return {
    id,
    trip_id: 't1',
    day_number: 1,
    position: 0,
    name: `Stop ${id}`,
    address: null,
    ...at(east),
    planned_time: iso(startMs),
    planned_end: iso(startMs + 60 * MIN),
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
    priority: 1,
    note: null,
    place_id: null,
    ...extra,
  };
}

describe('ETA estimate (free, straight line)', () => {
  it('walks at 5 km/h up to 2 km', () => {
    // 900 m at 5 km/h (83.3 m/min) = 10.8 -> 11 min
    const e = etaTo(base, at(900));
    expect(e.mode).toBe('walk');
    expect(e.minutes).toBe(11);
    expect(etaText(e)).toBe('~11 min walk');
    // 2 km exactly is still a walk: 24 min
    expect(etaTo(base, at(2000))).toMatchObject({ mode: 'walk', minutes: 24 });
  });

  it('rides at 25 km/h over 2 km', () => {
    // 5 km at 25 km/h (416.7 m/min) = 12 min
    const e = etaTo(base, at(5000));
    expect(e.mode).toBe('ride');
    expect(e.minutes).toBe(12);
    expect(etaText(e)).toBe('~12 min ride');
    expect(etaText(etaTo(base, at(30_000)))).toBe('~1 h 12 min ride');
  });

  it('is "here" within 50 m and at least 1 min beyond', () => {
    expect(etaTo(base, at(40))).toMatchObject({ minutes: 0 });
    expect(etaText(etaTo(base, at(40)))).toBe('here');
    expect(etaTo(base, at(60)).minutes).toBe(1);
  });

  it('opens Google Maps walking directions (driving for a ride)', () => {
    expect(meetDirectionsUrl({ lat: 5.4, lng: 100.3 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=5.4,100.3&travelmode=walking',
    );
    expect(meetDirectionsUrl({ lat: 5.4, lng: 100.3 }, 'ride')).toMatch(/travelmode=driving$/);
  });
});

describe("everyone's here", () => {
  const point = base;
  it('needs every member within 50 m', () => {
    expect(everyoneHere([at(10), at(-30, 20), at(0, 45)], point)).toBe(true);
    expect(everyoneHere([at(10), at(60)], point)).toBe(false);
    expect(everyoneHere([], point)).toBe(false);
  });

  it('ends a split only when both groups are there', () => {
    const m = (id: string, east: number) => ({ id, ...at(east) });
    const b = ['d'];
    expect(bothGroupsHere([m('a', 5), m('r', 10), m('d', 20)], point, b)).toBe(true);
    // Group B still on the way
    expect(bothGroupsHere([m('a', 5), m('r', 10), m('d', 400)], point, b)).toBe(false);
    // Only group A has a position: can't tell group B is there
    expect(bothGroupsHere([m('a', 5), m('r', 10)], point, b)).toBe(false);
    // Only group B has a position
    expect(bothGroupsHere([m('d', 5)], point, b)).toBe(false);
  });
});

describe('rejoin choice', () => {
  const day = [
    stop('done', T - 120 * MIN, 0, { status: 'done' }),
    stop('here', T - 30 * MIN, 0, { status: 'arrived' }),
    stop('next', T + 30 * MIN, 500),
    stop('later', T + 120 * MIN, 1000),
  ];

  it('picks the next stop group B can reach by its start', () => {
    const r = pickRejoin(day, [at(1400)], T)!; // 900 m from "next": 11 min
    expect(r.stop.id).toBe('next');
    expect(r.at).toBe(T + 30 * MIN);
    expect(r.inTime).toBe(true);
    expect(r.etaMin).toBe(11);
  });

  it('uses the slowest member of group B', () => {
    // 100 m from "next" = 2 min; 1.9 km = 22.8 -> 23 min walk, still before its start
    const r = pickRejoin(day, [at(600), at(2400)], T)!;
    expect(r.stop.id).toBe('next');
    expect(r.etaMin).toBe(23);
  });

  it('skips to a later stop when group B cannot make the next one', () => {
    const tight = [day[0], day[1], stop('next', T + 5 * MIN, 500), day[3]];
    // 900 m to "next" = 11 min, after its 14:05 start; 400 m to "later" = 5 min
    const r = pickRejoin(tight, [at(1400)], T)!;
    expect(r.stop.id).toBe('later');
    expect(r.at).toBe(T + 120 * MIN);
    expect(r.inTime).toBe(true);
  });

  it("falls back to the next stop at group B's arrival when none is reachable", () => {
    const tight = [day[1], stop('next', T + 3 * MIN, 500), stop('later', T + 4 * MIN, 1000)];
    // 1.99 km to "next" = 23.9 -> 24 min walk; 2.05 km to "later" = 4.9 -> 5 min ride: both too late
    const r = pickRejoin(tight, [at(500, 1990)], T)!;
    expect(r.stop.id).toBe('next');
    expect(r.inTime).toBe(false);
    expect(r.etaMin).toBe(24);
    // 14:24, rounded up to 14:25
    expect(r.at).toBe(T + 25 * MIN);
  });

  it('skips stops without a place and returns null when nothing is left today', () => {
    expect(pickRejoin([stop('x', T + 30 * MIN, 0, { lat: null, lng: null })], [base], T)).toBeNull();
    expect(pickRejoin([day[0], day[1]], [base], T)).toBeNull();
  });

  it("gives group A the stop they're at and the ones before the rejoin stop", () => {
    expect(groupAPlan(day, 'later').map((s) => s.id)).toEqual(['here', 'next']);
    expect(groupAPlan(day, 'next').map((s) => s.id)).toEqual(['here']);
  });
});

describe('current meet point / split', () => {
  const row = (extra: Partial<MeetPointRow>): MeetPointRow => ({
    id: 'm1',
    trip_id: 't1',
    set_by: 'a',
    kind: 'meet',
    name: 'Clan Jetties',
    lat: base.lat,
    lng: base.lng,
    stop_id: null,
    rejoin_at: null,
    group_b: [],
    set_at: iso(T),
    status: 'active',
    ended_at: null,
    ended_by: null,
    created_at: iso(T),
    ...extra,
  });

  it('is the newest one set at or before now, today', () => {
    const rows = [row({ id: 'old', set_at: iso(T - 60 * MIN) }), row({ id: 'new' }), row({ id: 'future', set_at: iso(T + 30 * MIN) })];
    expect(currentGathering(rows, 'meet', T + MIN)?.row.id).toBe('new');
    expect(currentGathering(rows, 'split', T + MIN)).toBeNull();
    // Yesterday's is gone
    expect(currentGathering([row({ set_at: iso(T - 24 * 60 * MIN) })], 'meet', T)).toBeNull();
  });

  it("shows \"together\" for 10 min, then nothing; cleared ones are gone; a demo clock jump back revives it", () => {
    const done = row({ status: 'together', ended_at: iso(T + 20 * MIN) });
    expect(currentGathering([done], 'meet', T + 25 * MIN)?.state).toBe('together');
    expect(currentGathering([done], 'meet', T + 31 * MIN)).toBeNull();
    expect(currentGathering([done], 'meet', T + 10 * MIN)?.state).toBe('active');
    expect(currentGathering([row({ status: 'cleared', ended_at: iso(T + 5 * MIN) })], 'meet', T + 6 * MIN)).toBeNull();
  });

  it('labels the split and counts down', () => {
    expect(splitTitle({ name: 'Clan Jetties', rejoin_at: iso(T + 60 * MIN) })).toBe('Split · rejoin at Clan Jetties at 15:00');
    expect(countdownText(T + 42 * MIN, T)).toBe('in 42 min');
    expect(countdownText(T + 75 * MIN, T)).toBe('in 1 h 15 min');
    expect(countdownText(T, T)).toBe('now');
    expect(countdownText(T - 12 * MIN, T)).toBe('12 min ago');
  });

  it('names a tapped spot after the stop or pin it is on', () => {
    const stops = [stop('s', T, 0, { name: 'Clan Jetties' })];
    const pins = [{ type: 'spot' as const, name: 'Cendol stall', ...at(300) }];
    expect(nameForSpot(at(20), stops, pins)).toBe('Clan Jetties');
    expect(nameForSpot(at(310), stops, pins)).toBe('Cendol stall');
    expect(nameForSpot(at(150), stops, pins)).toBeNull();
  });
});

describe('Demo mode: the member who wanders 900 m away', () => {
  const day0 = new Date(2026, 9, 12).getTime();
  const h = (hours: number) => day0 + hours * 60 * MIN;
  const stops = [stop('s1', h(9), 0), stop('s2', h(11), 1500), stop('s3', h(13), 3000), stop('s4', h(15), 4500), stop('s5', h(17), 6000)];
  const route = buildDemoRoute({ tripId: 't1', day: 1, stops, base: stops, members: [{ id: 'me', name: 'Aisha' }], meId: 'me' })!;
  const farEvent = route.events.find((e) => e.kind === 'far')!;
  const membersAt = (t: number): MapMember[] => {
    const loc = sampleRoute(route, t);
    return loc.members.map((m) => ({ ...m, seenAt: loc.at }));
  };
  // Stop statuses at time t, as the visit tracker would have them.
  const statusAt = (t: number) =>
    stops.map((s) => {
      const arrived = route.events.find((e) => e.kind === 'arrive' && e.stopId === s.id)!.at <= t;
      const left = route.events.find((e) => (e.kind === 'leave' || e.kind === 'early') && e.stopId === s.id)!.at <= t;
      return { ...s, status: left ? ('done' as const) : arrived ? ('arrived' as const) : ('planned' as const) };
    });

  it('splits with the far member as group B and rejoins at the next stop, back together on arrival', () => {
    const t = farEvent.at;
    const members = membersAt(t);
    const groupB = farMembers(members).map((f) => f.member.id);
    expect(groupB).toEqual([farEvent.memberId]);

    const day = statusAt(t);
    const rejoin = pickRejoin(day, members.filter((m) => groupB.includes(m.id)), t)!;
    const here = day.find((s) => s.status === 'arrived')!;
    const next = day[day.indexOf(here) + 1];
    expect(rejoin.stop.id).toBe(next.id);
    expect(rejoin.inTime).toBe(true);
    expect(rejoin.at).toBe(Date.parse(next.planned_time!));
    expect(bothGroupsHere(members, rejoin.stop, groupB)).toBe(false);

    const arrive = route.events.find((e) => e.kind === 'arrive' && e.stopId === next.id)!.at;
    expect(bothGroupsHere(membersAt(arrive), rejoin.stop, groupB)).toBe(true);
  });

  it("a meet point at the group's stop says everyone's here once the wanderer is back", () => {
    const here = statusAt(farEvent.at).find((s) => s.status === 'arrived')!;
    const point = { lat: here.lat!, lng: here.lng! };
    expect(everyoneHere(membersAt(farEvent.at), point)).toBe(false);
    const back = route.events.find((e) => e.kind === 'rejoin')!.at;
    expect(everyoneHere(membersAt(back), point)).toBe(true);
  });
});
