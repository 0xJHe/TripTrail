import { buildDemoRoute, type RouteStop } from '@/features/demo/route';
import {
  isNewer,
  isNewReset,
  lastEventAt,
  nextAction,
  sessionFromRow,
  YOUR_TURN,
  YOUR_TURN_KEPT,
  type DemoSessionRow,
} from '@/features/demo/session';
import { keptGoing, useKeepGoing } from '@/features/recap/keepGoing';
import { DEMO_OFF } from '@/lib/demo';
import type { DemoRoute } from '@/lib/location';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const MIN = 60_000;
const at = (day: number, h: number, m = 0) => new Date(2026, 9, 11 + day, h, m).toISOString();
const stop = (id: string, day: number, lat: number, lng: number, from: string, to: string): RouteStop => ({
  id,
  name: id,
  day_number: day,
  position: Number(id.slice(1)),
  lat,
  lng,
  planned_time: from,
  planned_end: to,
  is_outdoor: false,
  status: 'planned',
});
const stops = [
  stop('s1', 1, 5.4176, 100.3332, at(1, 9), at(1, 10)),
  stop('s2', 1, 5.4249, 100.269, at(1, 11), at(1, 12)),
  stop('s3', 1, 5.438, 100.31, at(1, 13), at(1, 14)),
  stop('s4', 2, 5.4128, 100.3407, at(2, 9), at(2, 10)),
];
const route: DemoRoute = buildDemoRoute({ tripId: 't1', day: 1, stops, members: [{ id: 'm1', name: 'A' }], meId: 'm1' })!;
const end = route.events.find((e) => e.kind === 'end')!;
const open = { closedByMe: false, keptGoing: false };

describe('sessionFromRow', () => {
  it('turns the shared row into the phone copy; no row = Demo mode off', () => {
    const row: DemoSessionRow = {
      trip_id: 't1',
      enabled: true,
      fake_time: '2026-10-12T01:00:00.000Z',
      day: 1,
      event_at: null,
      start_time: '2026-10-12T00:30:00.000Z',
      step: 7,
      reset_at: null,
    };
    expect(sessionFromRow(row)).toEqual({
      enabled: true,
      fakeTime: Date.parse('2026-10-12T01:00:00.000Z'),
      day: 1,
      eventAt: null,
      startTime: Date.parse('2026-10-12T00:30:00.000Z'),
      step: 7,
      resetAt: null,
    });
    expect(sessionFromRow(null)).toEqual(DEMO_OFF);
  });
});

describe('isNewer / isNewReset', () => {
  const here = { tripId: 't1', step: 5, resetAt: 'r1' };
  it('never puts back an older state (a slow reply after a newer one)', () => {
    expect(isNewer(here, 't1', { ...DEMO_OFF, step: 4 })).toBe(false);
    expect(isNewer(here, 't1', { ...DEMO_OFF, step: 5 })).toBe(true);
    expect(isNewer(here, 't1', { ...DEMO_OFF, step: 6 })).toBe(true);
    expect(isNewer(here, 't2', { ...DEMO_OFF, step: 1 })).toBe(true);
  });
  it("spots someone else's Reset, but not on first load of a trip", () => {
    expect(isNewReset(here, 't1', { ...DEMO_OFF, resetAt: 'r2' })).toBe(true);
    expect(isNewReset(here, 't1', { ...DEMO_OFF, resetAt: 'r1' })).toBe(false);
    expect(isNewReset(here, 't2', { ...DEMO_OFF, resetAt: 'r2' })).toBe(false);
  });
});

describe('nextAction (the debug bar middle button)', () => {
  it('moves to the next event during the day', () => {
    const a = nextAction(route, route.startsAt, open);
    expect(a).toEqual({ kind: 'event', label: 'Next event', at: route.events[1].at });
  });

  it("after the day's last event waits for the person: never Done for today or Keep going by itself", () => {
    expect(nextAction(route, end.at - MIN, open).kind).toBe('event');
    expect(nextAction(route, end.at, open)).toEqual({ kind: 'yourTurn', label: YOUR_TURN });
    // Even with later replay events (e.g. a member rejoining) it stays their turn.
    expect(nextAction(route, end.at + 5 * MIN, open)).toEqual({ kind: 'yourTurn', label: YOUR_TURN });
  });

  it('after Keep going it is still their turn, to tap Done for today', () => {
    expect(nextAction(route, end.at, { closedByMe: false, keptGoing: true })).toEqual({ kind: 'yourTurn', label: YOUR_TURN_KEPT });
  });

  it('offers Next day only once they have tapped Done for today', () => {
    expect(nextAction(route, end.at, { closedByMe: true, keptGoing: false })).toEqual({
      kind: 'nextDay',
      label: 'Next day',
      at: route.nextDayStartsAt,
    });
    const last = { ...route, nextDayStartsAt: null };
    expect(nextAction(last, end.at, { closedByMe: true, keptGoing: true }).kind).toBe('none');
  });

  it('does nothing without a route', () => {
    expect(nextAction(null, 0, open).kind).toBe('none');
  });

  it('saves the last event reached with each step', () => {
    expect(lastEventAt(route, end.at)).toBe(end.at);
    expect(lastEventAt(route, route.startsAt - MIN)).toBeNull();
    expect(lastEventAt(null, end.at)).toBeNull();
  });
});

describe('Keep going after a Reset', () => {
  it("forgets this trip's taps made during the demo, keeps the rest", () => {
    const start = Date.parse(at(1, 8, 30));
    useKeepGoing.setState({ at: { 't1:1': start + 9 * 60 * MIN, 't1:0': start - MIN, 't2:1': start + MIN } });
    useKeepGoing.getState().forgetSince('t1', start);
    const kept = useKeepGoing.getState().at;
    expect(keptGoing(kept, 't1', 1, start + 10 * 60 * MIN)).toBe(false);
    expect(kept).toEqual({ 't1:0': start - MIN, 't2:1': start + MIN });
  });
});
