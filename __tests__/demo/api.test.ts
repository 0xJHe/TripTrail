import { resetDemo, setDemoEnabled, stepDemo } from '@/features/demo/api';

// A stand-in for the demo_* SQL functions: same step rule (a tap applies only if it saw the latest step).
const row = {
  trip_id: 't1',
  enabled: false,
  fake_time: null as string | null,
  day: null as number | null,
  event_at: null as string | null,
  start_time: null as string | null,
  step: 0,
  reset_at: null as string | null,
};
const mockRpc = jest.fn(async (fn: string, a: Record<string, unknown>) => {
  await Promise.resolve();
  const reply = (applied: boolean, extra = {}) => ({ data: { applied, session: { ...row }, ...extra }, error: null });
  if (fn === 'demo_set_enabled') {
    if (row.enabled === a.p_on) return reply(false);
    Object.assign(row, { enabled: a.p_on, fake_time: null, step: row.step + 1 });
    return reply(true);
  }
  if (fn === 'demo_step') {
    if (!row.enabled || row.step !== a.p_step) return reply(false);
    Object.assign(row, { fake_time: a.p_fake_time, day: a.p_day, event_at: a.p_event_at, step: row.step + 1 });
    return reply(true);
  }
  if (fn === 'demo_reset') {
    if (!row.enabled || row.step !== a.p_step) return reply(false, { photos: [] });
    Object.assign(row, { fake_time: a.p_start, start_time: a.p_start, step: row.step + 1, reset_at: 'now' });
    return reply(true, { photos: ['t1/m1-photo.jpg'] });
  }
  throw new Error(fn);
});
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (fn: string, a: Record<string, unknown>) => mockRpc(fn, a) } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const NINE = Date.parse('2026-10-12T01:00:00.000Z');

describe('shared demo calls', () => {
  it('turning it on twice at once turns it on once', async () => {
    const [a, b] = await Promise.all([setDemoEnabled('t1', true), setDemoEnabled('t1', true)]);
    expect(row.step).toBe(1);
    expect(a.enabled && b.enabled).toBe(true);
  });

  it('two Next event taps at the same moment make one step, not a double jump', async () => {
    const seen = row.step;
    const [a, b] = await Promise.all([
      stepDemo('t1', seen, { fakeTime: NINE, day: 1, eventAt: NINE }),
      stepDemo('t1', seen, { fakeTime: NINE + 30 * 60_000, day: 1, eventAt: NINE + 30 * 60_000 }),
    ]);
    expect(row.step).toBe(seen + 1);
    expect(Date.parse(row.fake_time!)).toBe(NINE);
    // Both phones end up with the state that won.
    expect(a.fakeTime).toBe(NINE);
    expect(b.fakeTime).toBe(NINE);
    expect(mockRpc).toHaveBeenCalledWith('demo_step', expect.objectContaining({ p_trip: 't1', p_step: seen, p_day: 1 }));
  });

  it('two Resets at once reset once, and hand back the photos to remove', async () => {
    const seen = row.step;
    const start = NINE - 60 * 60_000;
    const [a, b] = await Promise.all([resetDemo('t1', seen, start), resetDemo('t1', seen, start)]);
    expect(row.step).toBe(seen + 1);
    expect([a.applied, b.applied].sort()).toEqual([false, true]);
    expect((a.applied ? a : b).photos).toEqual(['t1/m1-photo.jpg']);
    expect(a.session.fakeTime).toBe(start);
  });
});
