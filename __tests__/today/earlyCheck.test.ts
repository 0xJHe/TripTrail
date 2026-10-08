import { buildDemoRoute, demoTravelMin, EARLY_DEMO_AHEAD_MIN, EARLY_DEMO_SPARE_MIN } from '@/features/demo/route';
import type { Stop } from '@/features/planning/types';
import { applyChanges, emptyTracker, processReadings, readingTimes } from '@/features/today/arrival';
import {
  beforeEarlyChanges,
  earlyAlertFor,
  aheadOf,
  earlyCheck,
  fillStop,
  justLeft,
  moveEarlier,
  openEarlyFor,
  spareNow,
  withEarlyChanges,
} from '@/features/today/early';
import { dueChecks, lastLeftAt, lateAlertFor, openAlertFor } from '@/features/today/late';
import { todayView } from '@/features/today/todayPlan';
import type { EarlyAlert, LateAlert } from '@/features/today/types';
import { sampleRoute, type DemoRoute } from '@/lib/location';
import {
  CHECK_BEFORE_MIN,
  EARLY_AHEAD_MIN,
  EARLY_SPARE_MIN,
  estimateMinutes,
  isLate,
  paceFor,
  spareMinutes,
  worthAskingGoogle,
} from '@/supabase/functions/_shared/eta';
import type { NearbySuggestion } from '@/supabase/functions/_shared/nearby';

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
const [, funicular, lineClear, murals, mansion, chulia] = day;
const muralsStart = Date.parse(murals.planned_time!);

const lateRow = (stopId: string, status: LateAlert['status']): LateAlert => ({
  stop_id: stopId,
  trip_id: 't1',
  day_number: 1,
  checked_at: iso(at(10)),
  travel_min: 20,
  travel_source: 'estimate',
  starts_at: null,
  plan: { items: [], costChange: 0, endsAt: null },
  status,
  original: null,
  decided_by: null,
  decided_at: null,
});

const earlyRow = (stopId: string, extra: Partial<EarlyAlert> = {}): EarlyAlert => ({
  stop_id: stopId,
  trip_id: 't1',
  day_number: 1,
  left_stop_id: lineClear.id,
  left_at: iso(at(13)),
  checked_at: iso(at(13)),
  spare_min: 40,
  travel_min: 2,
  suggestion: null,
  status: 'open',
  added_stop_id: null,
  original: null,
  changed: null,
  decided_by: null,
  decided_at: null,
  ...extra,
});

const coffee: NearbySuggestion = {
  placeId: 'p-coffee',
  name: 'Black Kettle',
  lat: 5.4165,
  lng: 100.3345,
  kind: 'Café',
  category: 'food',
  outdoor: false,
  distanceM: 330,
  walkMin: 5,
  price: 15,
  withinBudget: true,
  reason: "Café 350 m away · matches your 'cafés' must-have",
  halalNote: false,
};

describe('the shared spare-time rule (running late and running early)', () => {
  const start = at(14);

  it('is next start − now − travel', () => {
    expect(spareMinutes(at(13), 10, start)).toBe(50);
    expect(spareMinutes(at(13, 55), 10, start)).toBe(-5);
  });

  it('gives exactly one answer for any spare time, so the two cards can never both apply', () => {
    for (let spare = -120; spare <= 180; spare += 0.5) {
      const now = start - (spare + 10) * MIN;
      const pace = paceFor(now, 10, start);
      expect(isLate(now, 10, start)).toBe(pace === 'late');
      expect(pace === 'late' && spare >= EARLY_SPARE_MIN).toBe(false);
      expect(pace).toBe(spare < -5 ? 'late' : spare >= EARLY_SPARE_MIN ? 'early' : 'on-time');
    }
  });

  it('is late only when now + travel is over the start + 5 min, early from 30 min spare', () => {
    expect(paceFor(start - 15 * MIN, 21, start)).toBe('late'); // 6 min over
    expect(paceFor(start - 15 * MIN, 20, start)).toBe('on-time'); // 5 min over: still on time
    expect(paceFor(start - 40 * MIN, 10, start)).toBe('early'); // 30 min spare
    expect(paceFor(start - 39 * MIN, 10, start)).toBe('on-time'); // 29 min spare
  });

  it('never asks Google for the late check when the same estimate says early', () => {
    for (let spare = -60; spare <= 120; spare++) {
      const now = start - (spare + 8) * MIN;
      if (paceFor(now, 8, start) === 'early') expect(worthAskingGoogle(now, 8, start)).toBe(false);
    }
  });

  it('never raises both cards for the same stop from the same check', () => {
    for (let mins = 90; mins >= -10; mins -= 1) {
      for (const travel of [1, 5, 12, 25, 40]) {
        const now = muralsStart - mins * MIN;
        const late = lateAlertFor({ tripId: 't1', next: murals as Stop & { planned_time: string }, dayStops: day, now, travelMin: travel, source: 'estimate' });
        const early = earlyCheck({ left: leftAhead(now, 30), next: murals, now, travelMin: travel, lateAlerts: [], earlyAlerts: [] });
        expect(late != null && early != null).toBe(false);
      }
    }
  });
});

/** The stop the group just left at `now`, `ahead` minutes before its planned end. */
const leftAhead = (now: number, ahead: number) => ({ planned_end: iso(now + ahead * MIN), left_at: iso(now) });

describe('earlyCheck', () => {
  const none = { lateAlerts: [], earlyAlerts: [] };

  it("shows how far ahead of the plan they are, not the whole gap to the next stop", () => {
    // Left 20 min before the stop's planned end, with 2 h 13 min until the next one.
    const now = muralsStart - 135 * MIN;
    expect(earlyCheck({ left: leftAhead(now, 20), next: murals, now, travelMin: 2, ...none })).toEqual({ aheadMin: 20, spareMin: 133 });
  });

  it('needs the group at least 15 min ahead of the plan', () => {
    const now = muralsStart - 135 * MIN;
    expect(earlyCheck({ left: leftAhead(now, 15), next: murals, now, travelMin: 2, ...none })?.aheadMin).toBe(15);
    // Left on time (or nearly): a long planned gap alone is no early card.
    expect(earlyCheck({ left: leftAhead(now, 14), next: murals, now, travelMin: 2, ...none })).toBeNull();
    expect(earlyCheck({ left: leftAhead(now, 0), next: murals, now, travelMin: 2, ...none })).toBeNull();
    expect(earlyCheck({ left: { planned_end: null, left_at: iso(now) }, next: murals, now, travelMin: 2, ...none })).toBeNull();
    expect(earlyCheck({ left: null, next: murals, now, travelMin: 2, ...none })).toBeNull();
  });

  it('also needs 30 min to spare before the next stop, in whole minutes', () => {
    const at45 = muralsStart - 45 * MIN;
    expect(earlyCheck({ left: leftAhead(at45, 40), next: murals, now: at45, travelMin: 5, ...none })?.spareMin).toBe(40);
    const at35 = muralsStart - 35 * MIN;
    expect(earlyCheck({ left: leftAhead(at35, 40), next: murals, now: at35, travelMin: 5, ...none })?.spareMin).toBe(30);
    const at34 = muralsStart - 34 * MIN;
    expect(earlyCheck({ left: leftAhead(at34, 40), next: murals, now: at34, travelMin: 5, ...none })).toBeNull();
  });

  it('needs a next stop today that is still planned, with a time and a place, and not started', () => {
    const left = leftAhead(at(13), 30);
    expect(earlyCheck({ left, next: null, now: at(13), travelMin: 2, ...none })).toBeNull();
    expect(earlyCheck({ left, next: { ...murals, status: 'arrived' }, now: at(13), travelMin: 2, ...none })).toBeNull();
    expect(earlyCheck({ left, next: { ...murals, lat: null }, now: at(13), travelMin: 2, ...none })).toBeNull();
    expect(earlyCheck({ left, next: murals, now: muralsStart + MIN, travelMin: 2, ...none })).toBeNull();
  });

  it('never shows for a stop that had a late card, whatever the group decided', () => {
    const left = leftAhead(at(13), 30);
    for (const status of ['open', 'accepted', 'kept'] as const) {
      expect(earlyCheck({ left, next: murals, now: at(13), travelMin: 2, lateAlerts: [lateRow(murals.id, status)], earlyAlerts: [] })).toBeNull();
    }
    // Each later stop is checked fresh.
    expect(
      earlyCheck({ left: leftAhead(at(15), 30), next: mansion, now: at(15), travelMin: 2, lateAlerts: [lateRow(murals.id, 'kept')], earlyAlerts: [] }),
    ).toEqual({ aheadMin: 30, spareMin: 58 });
  });

  it('shows once per stop', () => {
    const left = leftAhead(at(13), 30);
    expect(earlyCheck({ left, next: murals, now: at(13), travelMin: 2, lateAlerts: [], earlyAlerts: [earlyRow(murals.id, { status: 'kept' })] })).toBeNull();
  });
});

describe('aheadOf', () => {
  it("is the stop's planned end minus when the group left", () => {
    expect(aheadOf({ planned_end: iso(at(13, 30)) }, iso(at(12, 15)))).toBe(75);
    expect(aheadOf({ planned_end: null }, iso(at(12)))).toBeNull();
    expect(aheadOf(null, iso(at(12)))).toBeNull();
  });
});

describe('which card shows', () => {
  it('late always wins: an early card never shows for a stop with a late card', () => {
    const late = [lateRow(murals.id, 'open')];
    const early = [earlyRow(murals.id)];
    expect(openAlertFor(late, murals)).not.toBeNull();
    expect(openEarlyFor(early, late, murals)).toBeNull();
    // Even once the late card is decided.
    expect(openEarlyFor(early, [lateRow(murals.id, 'accepted')], murals)).toBeNull();
  });

  it('shows the open (or "move earlier?") early card for the stop the group is heading to', () => {
    expect(openEarlyFor([earlyRow(murals.id)], [], murals)?.stop_id).toBe(murals.id);
    expect(openEarlyFor([earlyRow(murals.id, { status: 'offer' })], [], murals)?.status).toBe('offer');
    for (const status of ['added', 'moved', 'kept'] as const) {
      expect(openEarlyFor([earlyRow(murals.id, { status })], [], murals)).toBeNull();
    }
    expect(openEarlyFor([earlyRow(murals.id)], [], mansion)).toBeNull();
    expect(openEarlyFor([earlyRow(murals.id)], [], { ...murals, status: 'arrived' })).toBeNull();
  });
});

describe('justLeft', () => {
  it('is the stop the group left in the last 20 min', () => {
    const stops = [
      { ...funicular, status: 'done' as const, left_at: iso(at(11, 50)) },
      { ...lineClear, status: 'done' as const, left_at: iso(at(13)) },
    ];
    expect(justLeft(stops, at(13, 5))?.id).toBe(lineClear.id);
    expect(justLeft(stops, at(13, 21))).toBeNull();
    // A leave after now (the demo clock went back) doesn't count.
    expect(justLeft(stops, at(12, 5))?.id).toBe(funicular.id);
  });
});

describe('earlyAlertFor', () => {
  it('saves the spare time, the free estimate, the stop they left and the suggestion', () => {
    const left = { ...lineClear, left_at: iso(at(13)) };
    expect(earlyAlertFor({ tripId: 't1', left, next: murals, now: at(13, 2), travelMin: 2, spareMin: 86, suggestion: coffee })).toEqual({
      stop_id: murals.id,
      trip_id: 't1',
      day_number: 1,
      left_stop_id: lineClear.id,
      left_at: iso(at(13)),
      checked_at: iso(at(13, 2)),
      spare_min: 86,
      travel_min: 2,
      suggestion: coffee,
    });
  });
});

describe('Add this', () => {
  const here = { lat: lineClear.lat!, lng: lineClear.lng! };
  const next = murals as Stop & { planned_time: string; lat: number; lng: number };

  it('starts once they get there and lasts the spare time minus walking there and on (max 60 min)', () => {
    const now = at(13, 30);
    const { stop: added, times } = fillStop({ suggestion: coffee, next, dayStops: day, here, now });
    const there = 5; // ~350 m at 80 m/min
    const spare = Math.floor(spareMinutes(now, estimateMinutes(here, next), muralsStart));
    expect(Date.parse(added.planned_time!)).toBe(now + there * MIN);
    const stay = (Date.parse(added.planned_end!) - Date.parse(added.planned_time!)) / MIN;
    expect(stay).toBeLessThanOrEqual(60);
    expect(stay).toBeLessThanOrEqual(spare - there);
    expect(added).toMatchObject({ name: 'Black Kettle', place_id: 'p-coffee', price: 15, is_estimate: true, category: 'food', day_number: 1 });
    expect(times).toEqual([]); // it fits: nothing else moves
  });

  it('caps the stay at 60 min when there is lots of time', () => {
    const { stop: added } = fillStop({ suggestion: coffee, next, dayStops: day, here, now: at(12, 45) });
    expect((Date.parse(added.planned_end!) - Date.parse(added.planned_time!)) / MIN).toBe(60);
  });

  it('only moves later stops when tapped too late for it to fit, never booked ones', () => {
    const booked = { ...mansion, is_booked: true };
    const dayStops = [...day.slice(0, 4), booked, chulia];
    const now = muralsStart - 10 * MIN;
    const { stop: added, times } = fillStop({ suggestion: coffee, next, dayStops, here, now });
    expect((Date.parse(added.planned_end!) - Date.parse(added.planned_time!)) / MIN).toBe(15);
    const moved = times.find((t) => t.id === murals.id)!;
    expect(Date.parse(moved.planned_time!)).toBeGreaterThan(muralsStart);
    expect(Date.parse(moved.planned_time!)).toBeGreaterThanOrEqual(Date.parse(added.planned_end!));
    expect(times.some((t) => t.id === booked.id)).toBe(false);
  });
});

describe('Go to next stop', () => {
  it('offers to move the next stop earlier by the spare time, in 5-min steps', () => {
    const moved = moveEarlier(murals, 43)!;
    expect(Date.parse(moved.planned_time!)).toBe(muralsStart - 40 * MIN);
    expect(Date.parse(moved.planned_end!)).toBe(Date.parse(murals.planned_end!) - 40 * MIN);
  });

  it("doesn't offer to move a booked stop, or less than 5 min", () => {
    expect(moveEarlier({ ...murals, is_booked: true }, 40)).toBeNull();
    expect(moveEarlier({ ...murals, category: 'hotel' }, 40)).toBeNull();
    expect(moveEarlier(murals, 4)).toBeNull();
  });

  it('works out the spare time again from where the group is now', () => {
    const alert = earlyRow(murals.id, { spare_min: 60, checked_at: iso(at(13)) });
    expect(spareNow(alert, murals, null, at(13, 10))).toBe(50);
    const here = { lat: murals.lat!, lng: murals.lng! };
    expect(spareNow(alert, murals, here, at(13, 10))).toBe(79); // at the door: 80 min − the 1 min minimum
  });
});

describe('Demo mode replay with running-early changes', () => {
  it('follows added stops and moved times, and can put the plan back as it was', () => {
    const added = { ...stop('Black Kettle', coffee.lat, coffee.lng, at(13, 10), at(13, 50)) };
    const stops = [...day, added];
    const moved = { id: murals.id, planned_time: iso(muralsStart - 40 * MIN), planned_end: iso(Date.parse(murals.planned_end!) - 40 * MIN) };
    const alerts = [
      earlyRow(murals.id, { status: 'added', added_stop_id: added.id, original: [], changed: [] }),
      earlyRow(mansion.id, {
        status: 'moved',
        checked_at: iso(at(15, 5)),
        original: [{ id: mansion.id, planned_time: mansion.planned_time, planned_end: mansion.planned_end }],
        changed: [{ ...moved, id: mansion.id }],
      }),
    ];
    const walked = withEarlyChanges(stops, alerts);
    expect(walked.find((s) => s.id === mansion.id)?.planned_time).toBe(moved.planned_time);
    expect(walked.some((s) => s.id === added.id)).toBe(true);
    const base = beforeEarlyChanges(walked, alerts);
    expect(base).toEqual(day);
    expect(withEarlyChanges(stops, [earlyRow(murals.id, { status: 'kept' })])).toBe(stops);
  });
});

describe("demo route's early moment", () => {
  /** Stops after replaying a route up to t, like useVisitTracker (a reading every 30 s). */
  const replay = (r: DemoRoute, stops: Stop[], t: number) => {
    const readings = readingTimes(r.startsAt - 30_000, t, 30_000).map((x) => {
      const loc = sampleRoute(r, x);
      return { ...(loc.me ?? loc.center), at: x };
    });
    return applyChanges(stops, processReadings(emptyTracker(), stops, readings).changes);
  };

  /** What useEarlyCheck and useLateCheck see at time t. */
  const check = (r: DemoRoute, stops: Stop[], t: number) => {
    const now = replay(r, stops, t);
    const view = todayView({ stage: 'decided', start: '2026-10-12', days: 1, stops: now, now: new Date(t) });
    if (view.kind !== 'day') throw new Error('expected a day');
    const next = view.next as (Stop & { planned_time: string; lat: number; lng: number }) | null;
    const here = sampleRoute(r, t).center;
    const left = justLeft(now, t);
    const early = next && !view.now ? earlyCheck({ left, next, now: t, travelMin: estimateMinutes(here, next), lateAlerts: [], earlyAlerts: [] }) : null;
    // The running-late check with Demo mode's travel time (the replay's own).
    const lateTravel = next ? Math.max(estimateMinutes(here, next), demoTravelMin(r, next.id, t) ?? 0) : 0;
    const late = next ? lateAlertFor({ tripId: 't1', next, dayStops: now, now: t, travelMin: lateTravel, source: 'demo' }) : null;
    const kinds = next ? dueChecks({ startsAt: Date.parse(next.planned_time), lastLeft: lastLeftAt(now, t), now: t, done: new Set() }) : [];
    return { stops: now, view, next, left, early, late, kinds };
  };

  const route = buildDemoRoute({ tripId: 't1', day: 1, stops: day, members: [], meId: 'me' })!;
  const early = route.events.find((e) => e.kind === 'early')!;
  const lateMoment = route.events.find((e) => e.kind === 'late')!;
  /** First reading where the visit tracker has the group as left. */
  const noticed = (() => {
    for (let t = early.at; t < early.at + 30 * MIN; t += 30_000) if (check(route, day, t).left) return t;
    throw new Error('the leave was never noticed');
  })();

  it('leaves a stop after the late one, with another stop to go', () => {
    expect(early.stopId).toBe(lineClear.id);
    expect(early.title).toMatch(/min early (.* to spare)/);
    expect(early.at).toBeGreaterThan(lateMoment.at);
  });

  it('is noticed within a few minutes, 15+ min ahead with 30+ min to spare: the early card shows', () => {
    expect(noticed - early.at).toBeLessThanOrEqual(8 * MIN);
    const c = check(route, day, noticed);
    expect(c.left?.id).toBe(lineClear.id);
    expect(c.view.now).toBeNull();
    expect(c.next?.id).toBe(murals.id);
    expect(c.early).not.toBeNull();
    expect(c.early!.aheadMin).toBeGreaterThanOrEqual(EARLY_AHEAD_MIN);
    expect(c.early!.spareMin).toBeGreaterThanOrEqual(EARLY_SPARE_MIN);
    // The card's number is how far ahead of the plan they left, not the gap to the next stop.
    expect(c.early!.aheadMin).toBe(Math.floor((Date.parse(lineClear.planned_end!) - Date.parse(c.left!.left_at!)) / MIN));
    expect(c.late).toBeNull();
  });

  it('also shows when "We\'re done here" is tapped at the moment itself', () => {
    const now = replay(route, day, early.at).map((s) => (s.id === lineClear.id ? { ...s, status: 'done' as const, left_at: iso(early.at) } : s));
    const view = todayView({ stage: 'decided', start: '2026-10-12', days: 1, stops: now, now: new Date(early.at) });
    if (view.kind !== 'day' || !view.next) throw new Error('expected a next stop');
    const next = view.next as Stop & { lat: number; lng: number };
    const travelMin = estimateMinutes(sampleRoute(route, early.at).center, next);
    expect(justLeft(now, early.at)?.id).toBe(lineClear.id);
    const left = justLeft(now, early.at);
    const card = earlyCheck({ left, next, now: early.at, travelMin, lateAlerts: [], earlyAlerts: [] })!;
    expect(card.spareMin).toBeGreaterThanOrEqual(EARLY_DEMO_SPARE_MIN);
    expect(card.aheadMin).toBeGreaterThanOrEqual(EARLY_DEMO_AHEAD_MIN);
  });

  it('never meets a late card on the way to the next stop', () => {
    for (let t = noticed; t < muralsStart; t += 5 * MIN) expect(check(route, day, t).late).toBeNull();
  });

  it("doesn't overlap the late moment: different stops, and outside its check window", () => {
    expect(lateMoment.stopId).toBe(funicular.id);
    const lateStart = Date.parse(funicular.planned_time!);
    expect(early.at).toBeGreaterThan(lateStart);
    expect(early.at < lateStart - CHECK_BEFORE_MIN * MIN || early.at > lateMoment.at).toBe(true);
    // And the late moment still has no early card: they haven't left yet there.
    expect(check(route, day, lateMoment.at).early).toBeNull();
  });

  it('keeps every moment in place after "Add this", and walks to the added stop on time', () => {
    const c = check(route, day, noticed);
    const next = c.next!;
    const { stop: added } = fillStop({ suggestion: coffee, next, dayStops: c.stops, here: sampleRoute(route, noticed).center, now: noticed });
    const coffeeStop: Stop = { ...stop(added.name, added.lat!, added.lng!, Date.parse(added.planned_time!), Date.parse(added.planned_end!)), category: 'food' };
    const after = buildDemoRoute({ tripId: 't1', day: 1, stops: [...day, coffeeStop], base: day, members: [], meId: 'me' })!;
    for (const kind of ['late', 'early', 'rain', 'far'] as const) {
      const was = route.events.find((e) => e.kind === kind)!;
      const now = after.events.find((e) => e.kind === kind)!;
      expect([now.stopId, now.memberId, now.at]).toEqual([was.stopId, was.memberId, was.at]);
    }
    const arrival = after.events.find((e) => e.kind === 'arrive' && e.stopId === coffeeStop.id)!;
    expect(arrival.at).toBeLessThanOrEqual(Date.parse(coffeeStop.planned_time!) + 5 * MIN);
    expect(demoTravelMin(after, coffeeStop.id, noticed)).toBeLessThanOrEqual(Math.ceil((Date.parse(coffeeStop.planned_time!) + 5 * MIN - noticed) / MIN));
  });

  it('gets to a stop moved earlier on its new time, so no late card follows', () => {
    const c = check(route, day, noticed);
    const moved = moveEarlier(murals, c.early!.spareMin)!;
    const stops = day.map((s) => (s.id === murals.id ? { ...s, ...moved } : s));
    const after = buildDemoRoute({ tripId: 't1', day: 1, stops, base: day, members: [], meId: 'me' })!;
    expect(after.events.find((e) => e.kind === 'early')!.at).toBe(early.at);
    const newStart = Date.parse(moved.planned_time!);
    const arrival = after.events.find((e) => e.kind === 'arrive' && e.stopId === murals.id)!;
    expect(arrival.at - newStart).toBeLessThanOrEqual(5 * MIN);
    const movedNext = stops.find((s) => s.id === murals.id)! as Stop & { planned_time: string; lat: number; lng: number };
    for (let t = noticed; t < newStart; t += MIN) {
      const travel = Math.max(estimateMinutes(sampleRoute(after, t).center, movedNext), demoTravelMin(after, murals.id, t) ?? 0);
      expect(lateAlertFor({ tripId: 't1', next: movedNext, dayStops: stops, now: t, travelMin: travel, source: 'demo' })).toBeNull();
    }
  });
});
