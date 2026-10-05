import {
  ARRIVE_M,
  emptyTracker,
  LEAVE_AFTER_MS,
  LEAVE_M,
  processReading,
  processReadings,
  readingTimes,
  undoFutureVisits,
  type Reading,
  type TrackerState,
} from '@/features/today/arrival';
import type { VisitStop } from '@/features/today/types';
import { offsetMeters } from '@/lib/distance';

const SEC = 1000;
const MIN = 60 * SEC;
const T0 = new Date(2026, 9, 12, 9, 0).getTime();

// Two real George Town spots ~600 m apart.
const temple = { lat: 5.4146, lng: 100.3393 };
const cafe = { lat: 5.4176, lng: 100.3332 };

function stop(id: string, at: { lat: number; lng: number }, extra: Partial<VisitStop> = {}): VisitStop {
  return { id, ...at, status: 'planned', arrived_at: null, left_at: null, ...extra };
}

/** A reading `east` metres from `p`, at T0 + `sec` seconds. */
const read = (p: { lat: number; lng: number }, east: number, sec: number): Reading => ({
  ...offsetMeters(p, east, 0),
  at: T0 + sec * SEC,
});

/** Feed readings one by one, applying changes to the stops like the tracker does. */
function run(stops: VisitStop[], readings: Reading[], state: TrackerState = emptyTracker()) {
  return processReadings(state, stops, readings);
}

describe('arrived: within 100 m for 2 readings in a row', () => {
  const stops = [stop('temple', temple), stop('cafe', cafe)];

  it('one reading inside 100 m is not enough', () => {
    const out = run(stops, [read(temple, 40, 0)]);
    expect(out.changes).toEqual([]);
    expect(out.state.near).toEqual({ stopId: 'temple', count: 1 });
  });

  it('two readings in a row marks it arrived, at the time of the second', () => {
    const out = run(stops, [read(temple, 40, 0), read(temple, 60, 30)]);
    expect(out.changes).toEqual([
      { stopId: 'temple', from: 'planned', status: 'arrived', arrived_at: new Date(T0 + 30 * SEC).toISOString(), left_at: null },
    ]);
  });

  it('just inside 100 m counts, just outside does not', () => {
    expect(run(stops, [read(temple, ARRIVE_M - 2, 0), read(temple, ARRIVE_M - 2, 30)]).changes).toHaveLength(1);
    expect(run(stops, [read(temple, ARRIVE_M + 2, 0), read(temple, ARRIVE_M + 2, 30)]).changes).toEqual([]);
  });

  it('the two readings must be in a row', () => {
    const out = run(stops, [read(temple, 20, 0), read(temple, 400, 30), read(temple, 20, 60)]);
    expect(out.changes).toEqual([]);
    expect(out.state.near).toEqual({ stopId: 'temple', count: 1 });
  });

  it('only planned stops can be arrived at', () => {
    const visited = [stop('temple', temple, { status: 'done', arrived_at: 'x', left_at: 'y' })];
    expect(run(visited, [read(temple, 0, 0), read(temple, 0, 30)]).changes).toEqual([]);
  });

  it('stops without a place are ignored', () => {
    const noPlace = [stop('x', temple, { lat: null, lng: null })];
    expect(run(noPlace, [read(temple, 0, 0), read(temple, 0, 30)]).changes).toEqual([]);
  });

  it('picks the nearest stop when two are within 100 m', () => {
    const near = offsetMeters(temple, 60, 0);
    const twoStops = [stop('a', temple), stop('b', near)];
    const out = run(twoStops, [read(temple, 50, 0), read(temple, 50, 30)]);
    expect(out.changes.map((c) => c.stopId)).toEqual(['b']);
  });
});

describe('left: more than 150 m away for 3 minutes after arriving', () => {
  const arrivedAt = new Date(T0 - 30 * MIN).toISOString();
  const atTemple = () => [stop('temple', temple, { status: 'arrived', arrived_at: arrivedAt }), stop('cafe', cafe)];

  it('3 minutes away marks it done, with left_at = the reading that hits 3 minutes', () => {
    const readings = [0, 30, 60, 90, 120, 150, 180].map((s) => read(temple, 300, s));
    const out = run(atTemple(), readings);
    expect(out.changes).toEqual([
      {
        stopId: 'temple',
        from: 'arrived',
        status: 'done',
        arrived_at: arrivedAt,
        left_at: new Date(T0 + LEAVE_AFTER_MS).toISOString(),
      },
    ]);
  });

  it('2 min 59 s away is not enough', () => {
    const out = run(atTemple(), [read(temple, 300, 0), read(temple, 300, 179)]);
    expect(out.changes).toEqual([]);
    expect(out.state.awaySince).toBe(T0);
  });

  it('coming back within 150 m starts the 3 minutes again', () => {
    const out = run(atTemple(), [read(temple, 300, 0), read(temple, 50, 120), read(temple, 300, 150), read(temple, 300, 300)]);
    expect(out.changes).toEqual([]);
    expect(out.state.awaySince).toBe(T0 + 150 * SEC);
  });

  it('between 100 and 150 m (e.g. the far side of a big temple) never counts as leaving', () => {
    const readings = Array.from({ length: 20 }, (_, i) => read(temple, LEAVE_M - 10, i * 30));
    expect(run(atTemple(), readings).changes).toEqual([]);
  });

  it('a single far reading does not leave on its own (needs the 3 minutes)', () => {
    expect(run(atTemple(), [read(temple, 2000, 0)]).changes).toEqual([]);
  });

  it('arriving at the next stop closes the last one if it had not timed out yet', () => {
    const close = offsetMeters(temple, 170, 0);
    const stops = [stop('temple', temple, { status: 'arrived', arrived_at: arrivedAt }), stop('next', close)];
    const out = run(stops, [read(close, 0, 0), read(close, 0, 30)]);
    const t = new Date(T0 + 30 * SEC).toISOString();
    expect(out.changes).toEqual([
      { stopId: 'temple', from: 'arrived', status: 'done', arrived_at: arrivedAt, left_at: t },
      { stopId: 'next', from: 'planned', status: 'arrived', arrived_at: t, left_at: null },
    ]);
  });
});

describe('a whole walk in one batch (Demo mode jump)', () => {
  it('arrives, leaves, and arrives at the next stop, one merged change per stop', () => {
    const stops = [stop('temple', temple), stop('cafe', cafe)];
    const readings: Reading[] = [
      read(temple, 0, 0),
      read(temple, 0, 30), // arrived at the temple
      read(temple, 0, 600),
      read(temple, 400, 630), // walking away
      read(temple, 500, 810), // 3 min away -> left
      { ...cafe, at: T0 + 900 * SEC },
      { ...cafe, at: T0 + 930 * SEC }, // arrived at the cafe
    ];
    const out = run(stops, readings);
    expect(out.changes).toEqual([
      {
        stopId: 'temple',
        from: 'planned',
        status: 'done',
        arrived_at: new Date(T0 + 30 * SEC).toISOString(),
        left_at: new Date(T0 + 810 * SEC).toISOString(),
      },
      { stopId: 'cafe', from: 'planned', status: 'arrived', arrived_at: new Date(T0 + 930 * SEC).toISOString(), left_at: null },
    ]);
  });

  it('keeps its count across batches (one reading now, one on the next tick)', () => {
    const stops = [stop('temple', temple)];
    const first = processReading(emptyTracker(), stops, read(temple, 10, 0));
    expect(first.changes).toEqual([]);
    const second = processReading(first.state, stops, read(temple, 10, 30));
    expect(second.changes.map((c) => c.status)).toEqual(['arrived']);
  });
});

describe('undoFutureVisits (Demo mode clock going back)', () => {
  const at = (min: number) => new Date(T0 + min * MIN).toISOString();
  const stops = [
    stop('a', temple, { status: 'done', arrived_at: at(0), left_at: at(30) }),
    stop('b', cafe, { status: 'done', arrived_at: at(40), left_at: at(90) }),
    stop('c', cafe, { status: 'arrived', arrived_at: at(100) }),
    stop('d', cafe),
  ];

  it('undoes arrivals after t and leavings after t, leaving earlier visits alone', () => {
    expect(undoFutureVisits(stops, T0 + 60 * MIN)).toEqual([
      { stopId: 'b', from: 'done', status: 'arrived', arrived_at: at(40), left_at: null },
      { stopId: 'c', from: 'arrived', status: 'planned', arrived_at: null, left_at: null },
    ]);
  });
});

describe('readingTimes', () => {
  it('fills a jump in 30 s steps, ending exactly at the new time', () => {
    expect(readingTimes(0, 100 * SEC, 30 * SEC)).toEqual([30, 60, 90, 100].map((s) => s * SEC));
  });

  it('caps very long jumps to the last readings', () => {
    const times = readingTimes(0, 24 * 60 * MIN, 30 * SEC, 10);
    expect(times).toHaveLength(10);
    expect(times[times.length - 1]).toBe(24 * 60 * MIN);
  });
});
