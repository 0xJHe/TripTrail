import { buildDemoRoute, type RouteStop } from '@/features/demo/route';
import { dayFinished } from '@/features/recap/dayEnd';
import { applyChanges, emptyTracker, processReadings, readingTimes, undoFutureVisits } from '@/features/today/arrival';
import type { VisitStop } from '@/features/today/types';
import { sampleRoute } from '@/lib/location';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * The bug: Demo mode, Day 1 at 18:00, the group has just left Cheong Fatt Tze Blue Mansion and
 * reaches Chulia Street street food at 19:00, yet Today said "That's every stop for today · 7 of
 * 7 stops visited". The walk from Armenian Street to Cheong Fatt Tze passes ~50 m from the Chulia
 * Street stop, which ticked it off hours early (arrived, then "left" as they walked on).
 */

const at = (h: number, m = 0) => new Date(2026, 10, 11, h, m).getTime();
const iso = (h: number, m = 0) => new Date(at(h, m)).toISOString();

// The trip's Day 1 (seed coordinates; supabase/functions/_shared/itinerary.ts).
const plan: (RouteStop & VisitStop)[] = [
  ['Roti canai at Transfer Road', 5.4196, 100.3327, iso(8, 30), iso(9, 15)],
  ['Penang Hill funicular', 5.4239, 100.2691, iso(9, 30), iso(10)],
  ['Penang Waterfall Hill Temple', 5.4318, 100.2925, iso(10), iso(12)],
  ['Nasi kandar at Line Clear', 5.4183, 100.3318, iso(12, 30), iso(13, 30)],
  ['Armenian Street murals', 5.4151, 100.3376, iso(14, 30), iso(15, 30)],
  ['Cheong Fatt Tze Blue Mansion', 5.4214, 100.3355, iso(16), iso(17)],
  ['Chulia Street street food', 5.4172, 100.3364, iso(19), iso(20)],
].map(([name, lat, lng, from, to], i) => ({
  id: `s${i}`,
  name: name as string,
  day_number: 1,
  position: i,
  lat: lat as number,
  lng: lng as number,
  planned_time: from as string,
  planned_end: to as string,
  is_outdoor: false,
  status: 'planned' as const,
  arrived_at: null,
  left_at: null,
}));
const CHULIA = 's6';

const route = buildDemoRoute({ tripId: 't1', day: 1, stops: plan, members: [{ id: 'me', name: 'Me' }], meId: 'me' })!;
const readingsTo = (from: number, to: number) => readingTimes(from, to, 30_000).map((t) => ({ ...sampleRoute(route, t).me!, at: t }));
/** Replay the demo route up to `to`; the stops as they'd be saved. */
const replayTo = (to: number, stops: typeof plan = plan) =>
  applyChanges(stops, processReadings(emptyTracker(), stops, readingsTo(route.startsAt - 30_000, to)).changes);

describe('walking past a later stop', () => {
  it("doesn't tick it off (Armenian Street -> Cheong Fatt Tze passes ~50 m from Chulia Street)", () => {
    const stops = plan.map((s, i) => (i <= 4 ? { ...s, status: 'done' as const, arrived_at: iso(14, 30), left_at: iso(15, 30) } : s));
    const a = { lat: 5.4151, lng: 100.3376 };
    const b = { lat: 5.4214, lng: 100.3355 };
    // Every 30 s for 15 min, in a straight line.
    const walk = Array.from({ length: 31 }, (_, k) => ({ lat: a.lat + ((b.lat - a.lat) * k) / 30, lng: a.lng + ((b.lng - a.lng) * k) / 30, at: at(15, 35) + k * 30_000 }));
    const out = processReadings(emptyTracker(), stops, walk);
    expect(out.changes.find((c) => c.stopId === CHULIA)).toBeUndefined();
  });

  it('still counts arriving there from 15 min before its start', () => {
    const stops = plan.map((s, i) => (i <= 5 ? { ...s, status: 'done' as const, arrived_at: iso(16), left_at: iso(17) } : s));
    const there = { lat: 5.4172, lng: 100.3364 };
    const out = processReadings(emptyTracker(), stops, [
      { ...there, at: at(18, 50) },
      { ...there, at: at(18, 50) + 30_000 },
    ]);
    // Arrived on the second reading in a row within 100 m.
    expect(out.changes).toEqual([
      { stopId: CHULIA, from: 'planned', status: 'arrived', arrived_at: new Date(at(18, 50) + 30_000).toISOString(), left_at: null },
    ]);
  });
});

describe('Demo mode Day 1 at 18:00 (the reported case)', () => {
  it('has not visited Chulia Street yet, so "That\'s every stop for today" stays hidden', () => {
    const arrive = route.events.find((e) => e.kind === 'arrive' && e.stopId === CHULIA)!.at;
    expect(at(18)).toBeLessThan(arrive);
    const stops = replayTo(at(18));
    expect(stops.find((s) => s.id === CHULIA)).toMatchObject({ status: 'planned', arrived_at: null, left_at: null });
    // Every stop before it is done.
    expect(stops.filter((s) => s.id !== CHULIA).every((s) => s.status === 'done')).toBe(true);
    expect(dayFinished(stops, at(18))).toBe(false);
  });

  it('shows the card only once Chulia Street is really finished', () => {
    const arrived = replayTo(at(19, 30));
    // There now, before its planned end (20:00): not finished.
    expect(arrived.find((s) => s.id === CHULIA)!.status).toBe('arrived');
    expect(dayFinished(arrived, at(19, 30))).toBe(false);
    // Left: finished from then on.
    const stops = replayTo(route.endsAt);
    const chulia = stops.find((s) => s.id === CHULIA)!;
    expect(chulia.status).toBe('done');
    expect(dayFinished(stops, Date.parse(chulia.left_at!))).toBe(true);
  });

  it('Reset back to 18:00 after a full run undoes the last stop too', () => {
    const full = replayTo(route.endsAt);
    const undone = applyChanges(full, undoFutureVisits(full, at(18)));
    expect(undone.find((s) => s.id === CHULIA)).toMatchObject({ status: 'planned', arrived_at: null, left_at: null });
    expect(dayFinished(undone, at(18))).toBe(false);
  });

  it('a leave saved for later on the fake clock does not finish the day yet', () => {
    const stops = plan.map((s) => ({ ...s, status: 'done' as const, arrived_at: iso(8), left_at: s.id === CHULIA ? iso(20, 5) : iso(9) }));
    expect(dayFinished(stops, at(18))).toBe(false);
  });
});
