import { buildDemoRoute } from '@/features/demo/route';
import type { Stop } from '@/features/planning/types';
import { applyChanges, emptyTracker, processReadings, readingTimes } from '@/features/today/arrival';
import { beforeNewDays, checkable, dayEndsAt, dueChecks, lastLeftAt, lateAlertFor, openAlertFor } from '@/features/today/late';
import { todayView } from '@/features/today/todayPlan';
import type { LateAlert } from '@/features/today/types';
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
    // The meal after it never moves.
    expect(alert.plan.items[1]).toMatchObject({ name: 'Nasi kandar at Line Clear', start: day[2].planned_time, note: null });
  });

  it('stays quiet when they will make it', () => {
    expect(lateAlertFor({ tripId: 't1', next: funicular as Stop & { planned_time: string }, dayStops, now: at(9, 8), travelMin: 27, source: 'estimate' })).toBeNull();
  });

  it('ends the day at 22:00 on the phone clock', () => {
    expect(dayEndsAt(at(9, 30))).toBe(at(22));
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
  it('raises the running-late card when the app notices the group left the stop before', () => {
    const route = buildDemoRoute({ tripId: 't1', day: 1, stops: day, members: [], meId: 'me' })!;
    const late = route.events.find((e) => e.kind === 'late')!;
    expect(late.stopId).toBe(funicular.id);

    // Replay the route like useVisitTracker does (a reading every 30 s) up to the late moment.
    const readings = readingTimes(route.startsAt - 30_000, late.at, 30_000).map((t) => {
      const loc = sampleRoute(route, t);
      return { ...(loc.me ?? loc.center), at: t };
    });
    const { changes } = processReadings(emptyTracker(), day, readings);
    const stops = applyChanges(day, changes);
    expect(stops[0].status).toBe('done'); // the leave was noticed
    expect(stops[1].status).toBe('planned'); // not at the funicular yet

    const view = todayView({ stage: 'decided', start: '2026-10-12', days: 1, stops, now: new Date(late.at) });
    if (view.kind !== 'day') throw new Error('expected a day');
    expect(view.next?.id).toBe(funicular.id);
    const kinds = dueChecks({ startsAt: start, lastLeft: lastLeftAt(stops, late.at), now: late.at, done: new Set() });
    expect(kinds).toContain('left');

    // Free estimate from where the group is: late, and close enough that Google is asked too.
    const here = sampleRoute(route, late.at).center;
    const estimate = estimateMinutes(here, funicular as { lat: number; lng: number });
    expect(worthAskingGoogle(late.at, estimate, start)).toBe(true);
    const alert = lateAlertFor({ tripId: 't1', next: view.next as Stop & { planned_time: string }, dayStops: stops, now: late.at, travelMin: estimate, source: 'estimate' });
    expect(alert).not.toBeNull();
  });
});
