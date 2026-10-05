import { buildDemoRoute } from '@/features/demo/route';
import type { Stop } from '@/features/planning/types';
import { applyChanges, emptyTracker, processReadings, readingTimes } from '@/features/today/arrival';
import { beforeNewDays, checkable, dueChecks, lastLeftAt, lateAlertFor, openAlertFor } from '@/features/today/late';
import { todayView } from '@/features/today/todayPlan';
import type { LateAlert } from '@/features/today/types';
import { haversineMeters } from '@/lib/distance';
import { sampleRoute } from '@/lib/location';
import { estimateMinutes, worthAskingGoogle } from '@/supabase/functions/_shared/eta';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

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
const funicular = day[1];
const start = Date.parse(funicular.planned_time!);

describe('dueChecks', () => {
  const none = new Set<'before' | 'left'>();

  it('checks once about 30 min before the stop starts', () => {
    expect(dueChecks({ startsAt: start, lastLeft: null, now: start - 31 * MIN, done: none })).toEqual([]);
    expect(dueChecks({ startsAt: start, lastLeft: null, now: start - 30 * MIN, done: none })).toEqual(['before']);
    expect(dueChecks({ startsAt: start, lastLeft: null, now: start - 10 * MIN, done: new Set(['before']) })).toEqual([]);
  });

  it('checks again when the group leaves a stop and the next starts in under 30 min', () => {
    const done = new Set(['before'] as const);
    expect(dueChecks({ startsAt: start, lastLeft: iso(start - 20 * MIN), now: start - 19 * MIN, done })).toEqual(['left']);
    expect(dueChecks({ startsAt: start, lastLeft: iso(start + 5 * MIN), now: start + 6 * MIN, done })).toEqual(['left']);
    // Left 45 min before: the "before" check covers it.
    expect(dueChecks({ startsAt: start, lastLeft: iso(start - 45 * MIN), now: start - 44 * MIN, done: none })).toEqual([]);
  });

  it('runs at most 2 checks per stop', () => {
    const both = new Set(['before', 'left'] as const);
    expect(dueChecks({ startsAt: start, lastLeft: iso(start - 5 * MIN), now: start, done: both })).toEqual([]);
    // Both due at once (app was closed): one check marks both.
    expect(dueChecks({ startsAt: start, lastLeft: iso(start - 5 * MIN), now: start, done: none })).toEqual(['before', 'left']);
  });
});

describe('lateAlertFor', () => {
  const dayStops = day.map((s, i) => (i === 0 ? { ...s, status: 'arrived' as const, arrived_at: iso(at(8, 30)) } : s));

  it('raises the card with the simple new day when now + travel is over the start + 5 min', () => {
    const alert = lateAlertFor({ tripId: 't1', next: funicular as Stop & { planned_time: string }, dayStops, now: at(9, 8), travelMin: 32, source: 'google' })!;
    expect(alert).toMatchObject({ stop_id: funicular.id, trip_id: 't1', day_number: 1, travel_min: 32, travel_source: 'google' });
    expect(alert.checked_at).toBe(iso(at(9, 8)));
    expect(alert.plan.items[0]).toMatchObject({ stopId: funicular.id, note: 'next slot' });
    expect(new Date(alert.plan.items[0].start).getHours()).toBe(9);
    expect(new Date(alert.plan.items[0].start).getMinutes()).toBe(40);
    // Lunch had time to spare before it, so it stays.
    expect(alert.plan.items[1]).toMatchObject({ name: 'Nasi kandar at Line Clear', start: day[2].planned_time, note: null });
  });

  it('stays quiet when they will make it', () => {
    expect(lateAlertFor({ tripId: 't1', next: funicular as Stop & { planned_time: string }, dayStops, now: at(9, 8), travelMin: 27, source: 'estimate' })).toBeNull();
  });
});

describe('which card shows', () => {
  const alert = (stopId: string, status: LateAlert['status']): LateAlert =>
    ({ stop_id: stopId, status, checked_at: iso(at(9)), original: null }) as LateAlert;

  it('shows the open card for the stop the group is heading to, once', () => {
    expect(openAlertFor([alert(funicular.id, 'open')], funicular)?.stop_id).toBe(funicular.id);
    expect(openAlertFor([alert(funicular.id, 'kept')], funicular)).toBeNull();
    expect(openAlertFor([alert(funicular.id, 'open')], { ...funicular, status: 'arrived' })).toBeNull();
    expect(openAlertFor([alert('other', 'open')], funicular)).toBeNull();
  });

  it('only checks stops with a time and a place that are still planned', () => {
    expect(checkable(funicular)).toBe(true);
    expect(checkable({ ...funicular, lat: null })).toBe(false);
    expect(checkable({ ...funicular, status: 'done' })).toBe(false);
    expect(checkable(null)).toBe(false);
  });

  it('builds the demo route from the times before an accepted new day', () => {
    const moved = day.map((s) =>
      s.id === funicular.id ? { ...s, planned_time: iso(at(9, 40)) } : s.id === day[4].id ? { ...s, status: 'dropped' as const } : s,
    );
    const accepted = {
      ...alert(funicular.id, 'accepted'),
      original: [
        { id: funicular.id, planned_time: funicular.planned_time, planned_end: funicular.planned_end, status: 'planned' as const },
        { id: day[4].id, planned_time: day[4].planned_time, planned_end: day[4].planned_end, status: 'planned' as const },
      ],
    };
    expect(beforeNewDays(moved, [accepted])).toEqual(day);
    expect(beforeNewDays(moved, [])).toBe(moved);
  });
});

describe("demo route's late moment", () => {
  const route = buildDemoRoute({ tripId: 't1', day: 1, stops: day, members: [], meId: 'me' })!;
  const late = route.events.find((e) => e.kind === 'late')!;

  /** Stops after replaying the route up to t, like useVisitTracker (a reading every 30 s). */
  const stopsAt = (t: number) => {
    const readings = readingTimes(route.startsAt - 30_000, t, 30_000).map((r) => {
      const loc = sampleRoute(route, r);
      return { ...(loc.me ?? loc.center), at: r };
    });
    return applyChanges(day, processReadings(emptyTracker(), day, readings).changes);
  };

  it('is the 30-minutes-before check, while the group is still at the stop before (screen 7)', () => {
    expect(late.stopId).toBe(funicular.id);
    const stops = stopsAt(late.at);
    expect(stops[0].status).toBe('arrived'); // Now block: the stop before, with We're done here
    expect(stops[1].status).toBe('planned');

    const view = todayView({ stage: 'decided', start: '2026-10-12', days: 1, stops, now: new Date(late.at) });
    if (view.kind !== 'day') throw new Error('expected a day');
    expect(view.now?.id).toBe(day[0].id);
    expect(view.next?.id).toBe(funicular.id);
    const kinds = dueChecks({ startsAt: start, lastLeft: lastLeftAt(stops, late.at), now: late.at, done: new Set() });
    expect(kinds).toEqual(['before']);

    // Late by the free estimate, and still late if Google's real time is up to 10 min shorter.
    const here = sampleRoute(route, late.at).center;
    const estimate = estimateMinutes(here, funicular as { lat: number; lng: number });
    expect(worthAskingGoogle(late.at, estimate, start)).toBe(true);
    const next = view.next as Stop & { planned_time: string };
    const args = { tripId: 't1', next, dayStops: stops, now: late.at, source: 'estimate' as const };
    expect(lateAlertFor({ ...args, travelMin: estimate })).not.toBeNull();
    expect(lateAlertFor({ ...args, travelMin: estimate - 9 })).not.toBeNull();
  });

  it('has no other moment between the check window opening and the late moment', () => {
    const windowOpens = start - 30 * MIN;
    const between = route.events.filter((e) => e.at >= windowOpens && e.at < late.at);
    expect(between).toEqual([]);
  });

  it('is one of the first stops, so most of the day gets a new plan (screen 7)', () => {
    // No early pair is 1 km apart: the furthest early pair is used (still early in the day).
    const morning = [
      stop('Hotel · Muntri Street', 5.4183, 100.3376, at(8, 30), at(9), { is_booked: true, category: 'hotel' }),
      stop('Armenian Street murals', 5.4151, 100.3376, at(9, 30), at(10, 30), { is_outdoor: true }),
      stop('Cheong Fatt Tze Blue Mansion', 5.4214, 100.3355, at(11), at(12)),
      stop('Nasi kandar at Line Clear', 5.4183, 100.3318, at(12, 30), at(13, 30), { category: 'food' }),
      stop('Penang Hill funicular', 5.4239, 100.2691, at(14, 30), at(16, 30), { is_outdoor: true }),
      stop('Chulia Street street food', 5.4172, 100.3364, at(19), at(20), { category: 'food' }),
    ];
    const r = buildDemoRoute({ tripId: 't1', day: 1, stops: morning, members: [], meId: 'me' })!;
    const ev = r.events.find((e) => e.kind === 'late')!;
    expect(ev.stopId).toBe(morning[2].id); // Blue Mansion, ~700 m from the murals

    const readings = readingTimes(r.startsAt - 30_000, ev.at, 30_000).map((t) => {
      const loc = sampleRoute(r, t);
      return { ...(loc.me ?? loc.center), at: t };
    });
    const stops = applyChanges(morning, processReadings(emptyTracker(), morning, readings).changes);
    expect(stops[1].status).toBe('arrived'); // still at the murals
    const next = stops[2] as Stop & { planned_time: string };
    const startsAt = Date.parse(next.planned_time);
    expect(dueChecks({ startsAt, lastLeft: lastLeftAt(stops, ev.at), now: ev.at, done: new Set() })).toEqual(['before']);
    const here = sampleRoute(r, ev.at).center;
    const travelMin = estimateMinutes(here, next as { lat: number; lng: number });
    const alert = lateAlertFor({ tripId: 't1', next, dayStops: stops, now: ev.at, travelMin, source: 'estimate' })!;
    expect(alert).not.toBeNull();
    expect(alert.plan.items).toHaveLength(4); // the Blue Mansion and every stop after it
    expect(alert.plan.items[0]).toMatchObject({ name: 'Cheong Fatt Tze Blue Mansion', note: 'next slot' });
  });

  it('picks the first early pair at least 1 km apart, so waiting never counts as arriving (Port Dickson)', () => {
    const pd = [
      stop('Teluk Kemang Beach', 2.4465, 101.8566, at(9, 30), at(10)),
      stop('Siva house', 2.4469, 101.8569, at(10, 15), at(10, 30)), // ~55 m from the beach
      stop('Restoran Nelayan Teluk Kemang', 2.4637, 101.8655, at(12), at(13), { category: 'food' }), // ~2 km
      stop('Pantai Cahaya Negeri', 2.4049, 101.8752, at(15), at(17), { is_outdoor: true }),
    ];
    const r = buildDemoRoute({ tripId: 't1', day: 1, stops: pd, members: [], meId: 'me' })!;
    const ev = r.events.find((e) => e.kind === 'late')!;
    expect(ev.stopId).toBe(pd[2].id);
    const readings = readingTimes(r.startsAt - 30_000, ev.at, 30_000).map((t) => {
      const loc = sampleRoute(r, t);
      return { ...(loc.me ?? loc.center), at: t };
    });
    const stops = applyChanges(pd, processReadings(emptyTracker(), pd, readings).changes);
    expect(stops.map((x) => x.status)).toEqual(['done', 'arrived', 'planned', 'planned']);
  });

  it('skips a booked second stop and is late for the third', () => {
    const withFlight = [
      stop('Breakfast at Toh Soon', 5.418, 100.3329, at(8), at(8, 45), { category: 'food' }),
      stop('Ferry to Butterworth', 5.4141, 100.3424, at(9), at(9, 30), { is_booked: true }),
      stop('Fort Cornwallis', 5.4207, 100.3436, at(10, 30), at(11, 30), { is_outdoor: true }),
      stop('Lunch at Kapitan', 5.417, 100.3383, at(12, 30), at(13, 30), { category: 'food' }),
    ];
    const r = buildDemoRoute({ tripId: 't1', day: 1, stops: withFlight, members: [], meId: 'me' })!;
    expect(r.events.find((e) => e.kind === 'late')!.stopId).toBe(withFlight[2].id);
  });

  it('works when the stop before starts inside the check window too', () => {
    const close = [
      stop('Kopi at Toh Soon', 5.418, 100.3329, at(9, 10), at(9, 25), { category: 'food' }),
      stop('Penang Hill', 5.4239, 100.2691, at(9, 30), at(11)),
    ];
    const r = buildDemoRoute({ tripId: 't1', day: 1, stops: close, members: [], meId: 'me' })!;
    const ev = r.events.find((e) => e.kind === 'late')!;
    const arriveBefore = r.events.find((e) => e.kind === 'arrive' && e.stopId === close[0].id)!;
    const hill = Date.parse(close[1].planned_time!);
    // By the time they reach the stop before, the estimate from there already says late.
    const est = estimateMinutes(close[0] as { lat: number; lng: number }, close[1] as { lat: number; lng: number });
    expect(arriveBefore.at + est * MIN).toBeGreaterThan(hill + 5 * MIN);
    expect(ev.at).toBeGreaterThan(arriveBefore.at);
    expect(haversineMeters(sampleRoute(r, ev.at).center, close[0] as { lat: number; lng: number })).toBeLessThan(100);
  });
});
