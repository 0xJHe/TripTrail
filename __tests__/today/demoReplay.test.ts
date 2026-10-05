import { buildDemoRoute, type RouteStop } from '@/features/demo/route';
import { emptyTracker, processReadings, readingTimes } from '@/features/today/arrival';
import type { VisitStop } from '@/features/today/types';
import { sampleRoute } from '@/lib/location';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const MIN = 60_000;
const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).toISOString();

const plan: (RouteStop & VisitStop)[] = [
  ['Toh Soon Cafe', 5.4176, 100.3332, at(8, 30), at(9, 15)],
  ['Penang Hill', 5.4249, 100.269, at(10), at(12)],
  ['Gurney Drive hawkers', 5.438, 100.31, at(12, 45), at(13, 45)],
  ['Kek Lok Si', 5.3998, 100.2734, at(14, 30), at(16)],
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

const route = buildDemoRoute({ tripId: 't1', day: 1, stops: plan, members: [{ id: 'me', name: 'Me' }], meId: 'me' })!;
const replay = (from: number, to: number, stops = plan, state = emptyTracker()) =>
  processReadings(
    state,
    stops,
    readingTimes(from, to, 30_000).map((t) => ({ ...sampleRoute(route, t).me!, at: t })),
  );

describe('Demo mode replay through the arrive / leave rules', () => {
  it('ticks every stop off close to the demo arrive / leave events', () => {
    const out = replay(route.startsAt - 30_000, route.endsAt);
    for (const s of plan) {
      const change = out.changes.find((c) => c.stopId === s.id)!;
      const arrive = route.events.find((e) => e.kind === 'arrive' && e.stopId === s.id)!.at;
      const leaveEvent = route.events.find((e) => (e.kind === 'leave' || e.kind === 'early') && e.stopId === s.id)!.at;
      // Walking in, the group is inside 100 m a little before reaching the spot itself.
      expect(Math.abs(Date.parse(change.arrived_at!) - arrive)).toBeLessThanOrEqual(3 * MIN);
      // The demo day ends with the group still at the last stop.
      if (s === plan[plan.length - 1]) {
        expect(change.status).toBe('arrived');
        continue;
      }
      expect(change.status).toBe('done');
      // Leaving is confirmed 3 min after the group is 150 m out.
      expect(Date.parse(change.left_at!) - leaveEvent).toBeGreaterThan(0);
      expect(Date.parse(change.left_at!) - leaveEvent).toBeLessThanOrEqual(15 * MIN);
    }
  });

  it('after a "Next event" jump to an arrival, the next reading at the paused time confirms it', () => {
    const arrive = route.events.find((e) => e.kind === 'arrive' && e.stopId === 's1')!.at;
    const jump = replay(route.startsAt - 30_000, arrive);
    expect(jump.changes.find((c) => c.stopId === 's0')?.status).toBe('done');
    // The phone reads again while the fake clock stands still.
    const stops = plan.map((s) => {
      const c = jump.changes.find((x) => x.stopId === s.id);
      return c ? { ...s, status: c.status, arrived_at: c.arrived_at, left_at: c.left_at } : s;
    });
    const again = processReadings(jump.state, stops, [{ ...sampleRoute(route, arrive).me!, at: arrive }]);
    expect(again.changes).toEqual([
      { stopId: 's1', from: 'planned', status: 'arrived', arrived_at: new Date(arrive).toISOString(), left_at: null },
    ]);
  });
});
