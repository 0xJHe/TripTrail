import { canSeeStop, hiddenStopsKey, mainPlan, splitEnded, splitStopProblem, stopGroupSize } from '@/features/group/splitStops';
import type { MeetPointRow } from '@/features/group/types';

const T = (h: number, m = 0) => new Date(2026, 9, 12, h, m).getTime();
const iso = (h: number, m = 0) => new Date(T(h, m)).toISOString();

const split = (over: Partial<MeetPointRow> = {}): MeetPointRow => ({
  id: 'sp1',
  trip_id: 't1',
  set_by: 'a',
  kind: 'split',
  name: 'Clan Jetties',
  lat: 5.41,
  lng: 100.34,
  stop_id: 'rejoin',
  rejoin_at: iso(15),
  group_b: [{ id: 'b', name: 'Mei' }],
  set_at: iso(12),
  status: 'active',
  ended_at: null,
  ended_by: null,
  created_at: iso(12),
  ...over,
});

const shared = { id: 's1', split_id: null, status: 'planned' };
const bStop = { id: 'b1', split_id: 'sp1', status: 'planned' };

describe('canSeeStop', () => {
  it('shared stops: everyone', () => {
    expect(canSeeStop(shared, [], 'a', T(13))).toBe(true);
  });

  it('group B stops: only group B', () => {
    expect(canSeeStop(bStop, [split()], 'b', T(13))).toBe(true);
    expect(canSeeStop(bStop, [split()], 'a', T(13))).toBe(false);
    expect(canSeeStop(bStop, [split()], null, T(13))).toBe(false);
  });

  it('hidden until the split row is loaded, and before it was set (Demo Reset)', () => {
    expect(canSeeStop(bStop, [], 'b', T(13))).toBe(false);
    expect(canSeeStop(bStop, [split()], 'b', T(11))).toBe(false);
  });

  it('after the split: planned ones go, visited ones stay for group B', () => {
    const ended = split({ status: 'together', ended_at: iso(15) });
    expect(splitEnded(ended, T(14))).toBe(false);
    expect(splitEnded(ended, T(15, 5))).toBe(true);
    expect(canSeeStop(bStop, [ended], 'b', T(14))).toBe(true);
    expect(canSeeStop(bStop, [ended], 'b', T(15, 5))).toBe(false);
    expect(canSeeStop({ ...bStop, status: 'done' }, [ended], 'b', T(15, 5))).toBe(true);
    expect(canSeeStop({ ...bStop, status: 'done' }, [ended], 'a', T(15, 5))).toBe(false);
  });
});

describe('hiddenStopsKey / mainPlan / stopGroupSize', () => {
  it('lists what this person cannot see, as a stable key', () => {
    const stops = [shared, bStop, { id: 'b0', split_id: 'sp1', status: 'planned' }];
    expect(hiddenStopsKey(stops, [split()], 'a', T(13))).toBe('b0,b1');
    expect(hiddenStopsKey(stops, [split()], 'b', T(13))).toBe('');
  });

  it("the shared plan leaves group B's stops out (late / early / rain checks)", () => {
    expect(mainPlan([shared, bStop])).toEqual([shared]);
    const plain = [shared];
    expect(mainPlan(plain)).toBe(plain);
  });

  it('spend count: group B for their stops, else everyone', () => {
    const two = split({ group_b: [{ id: 'b', name: 'Mei' }, { id: 'c', name: 'Ravi' }] });
    expect(stopGroupSize(bStop, [two], 4)).toBe(2);
    expect(stopGroupSize(shared, [two], 4)).toBe(4);
  });
});

describe('splitStopProblem', () => {
  it('must start and end by the rejoin time', () => {
    expect(splitStopProblem(iso(13), iso(14), iso(15))).toBeNull();
    expect(splitStopProblem(iso(14), iso(15), iso(15))).toBeNull();
    expect(splitStopProblem(iso(14), iso(15, 30), iso(15))).toMatch(/rejoin time/);
    expect(splitStopProblem(iso(15), iso(16), iso(15))).toMatch(/rejoin time/);
    expect(splitStopProblem(iso(15), iso(16), null)).toBeNull();
  });
});
