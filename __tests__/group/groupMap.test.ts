import { buildDemoRoute } from '@/features/demo/route';
import {
  cameraPoints,
  distanceText,
  farMembers,
  farText,
  groupCentre,
  lastSeenText,
  latestByMember,
  lowBatteryMembers,
  lowBatteryText,
  memberLabel,
  nextStop,
  sharingWindow,
  showLastSeen,
  type MapMember,
} from '@/features/group/groupMap';
import type { LocationRow } from '@/features/group/types';
import type { Stop } from '@/features/planning/types';
import { haversineMeters, offsetMeters } from '@/lib/distance';
import { sampleRoute } from '@/lib/location';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const base = { lat: 5.4172, lng: 100.3364 };
const T = new Date(2026, 9, 12, 14, 35).getTime();
const MIN = 60_000;

function member(id: string, name: string, east: number, north: number, extra: Partial<MapMember> = {}): MapMember {
  return { id, name, isMe: false, battery: 80, seenAt: T, ...offsetMeters(base, east, north), ...extra };
}

describe('far from group', () => {
  it('flags a member more than 500 m from the group, measured from the rest', () => {
    const group = [
      member('a', 'Aisha Rahman', 0, 0, { isMe: true }),
      member('r', 'Ravi', 20, -20),
      member('m', 'Mei', -20, 20),
      member('d', 'Daniel', 636, 636), // ~900 m north-east
    ];
    const far = farMembers(group);
    expect(far.map((f) => f.member.id)).toEqual(['d']);
    expect(far[0].distanceM).toBeGreaterThan(880);
    expect(far[0].distanceM).toBeLessThan(920);
    expect(farText(far[0])).toBe('Daniel is 900 m from the group');
  });

  it('does not flag anyone when the group is within 500 m', () => {
    const group = [member('a', 'Aisha', 0, 0), member('r', 'Ravi', 300, 0), member('m', 'Mei', 0, 450)];
    expect(farMembers(group)).toEqual([]);
  });

  it('just over 500 m counts, 500 m does not', () => {
    expect(farMembers([member('a', 'A', 0, 0), member('b', 'B', 0, 0), member('c', 'C', 0, 510)]).map((f) => f.member.id)).toEqual(['c']);
    expect(farMembers([member('a', 'A', 0, 0), member('b', 'B', 0, 0), member('c', 'C', 0, 495)])).toEqual([]);
  });

  it("one far member doesn't drag the centre (3 people, one 1.2 km away)", () => {
    const group = [member('a', 'A', 0, 0), member('b', 'B', 50, 0), member('c', 'C', 1200, 0)];
    expect(farMembers(group).map((f) => f.member.id)).toEqual(['c']);
    const centre = groupCentre(group)!;
    expect(haversineMeters(centre, offsetMeters(base, 25, 0))).toBeLessThan(1);
  });

  it('with two people apart, the other person is the far one (this phone is the group)', () => {
    const far = farMembers([member('d', 'Daniel', 800, 0), member('a', 'Aisha', 0, 0, { isMe: true })]);
    expect(far.map((f) => f.member.id)).toEqual(['d']);
    expect(farText(far[0])).toBe('Daniel is 800 m from the group');
  });

  it('says "You are" when this phone is the far one', () => {
    const far = farMembers([member('a', 'A', 0, 0), member('b', 'B', 10, 0), member('me', 'Me', 0, 700, { isMe: true })]);
    expect(farText(far[0])).toBe('You are 700 m from the group');
  });

  it('nobody is far when alone', () => {
    expect(farMembers([member('a', 'A', 0, 0)])).toEqual([]);
    expect(farMembers([])).toEqual([]);
  });

  it('formats distances', () => {
    expect(distanceText(904)).toBe('900 m');
    expect(distanceText(1240)).toBe('1.2 km');
  });
});

describe('low battery', () => {
  it('flags members below 15%, lowest first; unknown battery is never low', () => {
    const group = [
      member('a', 'Aisha', 0, 0, { battery: 84 }),
      member('m', 'Mei', 0, 0, { battery: 12 }),
      member('d', 'Daniel', 0, 0, { battery: 15 }),
      member('r', 'Ravi', 0, 0, { battery: 9 }),
      member('x', 'Xin', 0, 0, { battery: null }),
    ];
    expect(lowBatteryMembers(group).map((m) => m.id)).toEqual(['r', 'm']);
  });

  it('says whose battery and that they may go dark', () => {
    expect(lowBatteryText(member('m', 'Mei Ling', 0, 0, { battery: 12 }))).toBe("Mei's battery is 12% — may go dark soon");
    expect(lowBatteryText(member('me', 'Me', 0, 0, { battery: 8, isMe: true }))).toBe('Your battery is 8% — may go dark soon');
  });

  it('keeps showing a low-battery member at their last position, marked "last seen"', () => {
    const mei = member('m', 'Mei', 0, 0, { battery: 12, seenAt: new Date(2026, 9, 12, 14, 20).getTime() });
    expect(showLastSeen(mei, T)).toBe(true);
    expect(lastSeenText(mei)).toBe('last seen 14:20');
    expect(memberLabel(mei)).toBe('Mei · 12%');
  });

  it('a fresh position with a good battery is not "last seen"; an old one is', () => {
    expect(showLastSeen(member('a', 'A', 0, 0, { seenAt: T - MIN }), T)).toBe(false);
    expect(showLastSeen(member('a', 'A', 0, 0, { seenAt: T - 10 * MIN }), T)).toBe(true);
    expect(showLastSeen(member('me', 'Me', 0, 0, { isMe: true, battery: 5 }), T)).toBe(false);
  });
});

describe('positions', () => {
  it('keeps the newest row per member', () => {
    const row = (member_id: string, min: number, lat: number): LocationRow => ({
      member_id,
      trip_id: 't1',
      lat,
      lng: 100,
      battery: 50,
      recorded_at: new Date(T + min * MIN).toISOString(),
    });
    const latest = latestByMember([row('a', 0, 1), row('a', 2, 2), row('b', 1, 3), row('a', 1, 4)]);
    expect(latest.get('a')?.lat).toBe(2);
    expect(latest.get('b')?.lat).toBe(3);
  });

  it('shares from 60 min before the first stop to 60 min after the last', () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).toISOString();
    const w = sharingWindow([
      { planned_time: at(9), planned_end: at(10), status: 'done' },
      { planned_time: at(8, 30), planned_end: at(9), status: 'dropped' },
      { planned_time: at(15), planned_end: at(17), status: 'planned' },
    ]);
    expect(w).toEqual({ from: Date.parse(at(8)), to: Date.parse(at(18)) });
    expect(sharingWindow([])).toBeNull();
  });
});

describe('demo route', () => {
  it('the wandering member shows up 900 m from the group with low battery', () => {
    const day = new Date(2026, 9, 12);
    const stop = (id: string, h: number, east: number, extra: Partial<Stop> = {}): Stop => ({
      id,
      trip_id: 't1',
      day_number: 1,
      position: h,
      name: `Stop ${id}`,
      address: null,
      ...offsetMeters(base, east, 0),
      planned_time: new Date(day.getTime() + h * 60 * MIN).toISOString(),
      planned_end: new Date(day.getTime() + (h + 1.5) * 60 * MIN).toISOString(),
      price: 10,
      is_estimate: true,
      is_booked: false,
      is_outdoor: id === 's4',
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
    });
    const stops = [stop('s1', 9, 0), stop('s2', 11, 1500), stop('s3', 13, 3000), stop('s4', 15, 4500), stop('s5', 17, 6000)];
    const route = buildDemoRoute({
      tripId: 't1',
      day: 1,
      stops,
      base: stops,
      members: [{ id: 'me', name: 'Aisha' }],
      meId: 'me',
    })!;
    const farEvent = route.events.find((e) => e.kind === 'far')!;
    const loc = sampleRoute(route, farEvent.at);
    const members: MapMember[] = loc.members.map((m) => ({ ...m, seenAt: loc.at }));
    const far = farMembers(members);
    expect(far.map((f) => f.member.id)).toEqual([farEvent.memberId]);
    expect(farText(far[0])).toMatch(/ is 900 m from the group$/);
    expect(lowBatteryMembers(members).map((m) => m.id)).toEqual([farEvent.memberId]);
  });
});

describe('camera', () => {
  const stop = (status: Stop['status'], east: number) => ({ status, ...offsetMeters(base, east, 0) });

  it('fits every member, the far one too, and the next stop still to come', () => {
    const members = [member('a', 'A', 0, 0), member('d', 'D', 636, 636)];
    const stops = [stop('done', 100), stop('arrived', 200), stop('dropped', 250), stop('planned', 300), stop('planned', 400)];
    expect(nextStop(stops)).toBe(stops[3]);
    const pts = cameraPoints(members, stops);
    expect(pts).toHaveLength(3);
    expect(pts[1]).toEqual({ lat: members[1].lat, lng: members[1].lng });
    expect(pts[2]).toEqual({ lat: stops[3].lat, lng: stops[3].lng });
  });

  it('just the members when no stop is left today', () => {
    expect(cameraPoints([member('a', 'A', 0, 0)], [stop('done', 100)])).toHaveLength(1);
  });

  it('the stops when nobody is on the map (dropped ones left out)', () => {
    expect(cameraPoints([], [stop('done', 100), stop('dropped', 200), stop('planned', 300)])).toHaveLength(2);
  });
});
