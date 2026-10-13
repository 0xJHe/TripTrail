// Turning Demo mode on, end to end on one phone: Settings switch -> demo_set_enabled ->
// demo_init (the replay starts the clock) -> now() is the fake time. Supabase is faked with
// the same rules as the SQL functions.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useDemoActions } from '@/features/demo/hooks/useDemoActions';
import { useDemoReplay } from '@/features/demo/hooks/useDemoReplay';
import { useDemoSession } from '@/features/demo/hooks/useDemoSession';
import type { RouteStop } from '@/features/demo/route';
import { useCurrentTrip } from '@/features/trip/store';
import { now } from '@/lib/clock';
import { DEMO_OFF, setDemoSession, useDemo } from '@/lib/demo';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockSTART = new Date(2026, 9, 12, 9, 0).toISOString();
const mockServer = {
  row: null as null | Record<string, unknown>,
  fail: null as null | string,
  /** Only demo_init fails (Demo mode turns on, the clock can't start). */
  failInit: null as null | string,
};
jest.mock('@/lib/supabase', () => {
  const reply = (applied: boolean) => ({ data: { applied, session: mockServer.row ? { ...mockServer.row } : null }, error: null });
  return {
    supabase: {
      rpc: async (fn: string, a: Record<string, unknown>) => {
        await Promise.resolve();
        if (mockServer.fail) return { data: null, error: { message: mockServer.fail, code: '42883' } };
        const r = (mockServer.row ??= { trip_id: a.p_trip, enabled: false, fake_time: null, day: null, event_at: null, start_time: null, step: 0, reset_at: null });
        if (fn === 'demo_set_enabled') {
          if (r.enabled === a.p_on) return reply(false);
          Object.assign(r, { enabled: a.p_on, fake_time: null, start_time: null, step: (r.step as number) + 1 });
          if (a.p_on && a.p_start) Object.assign(r, { fake_time: a.p_start, start_time: a.p_start, day: a.p_day });
          return reply(true);
        }
        if (fn === 'demo_init') {
          if (mockServer.failInit) return { data: null, error: { message: mockServer.failInit } };
          if (!r.enabled || r.fake_time != null) return reply(false);
          Object.assign(r, { fake_time: a.p_start, start_time: a.p_start, day: a.p_day, step: (r.step as number) + 1 });
          return reply(true);
        }
        throw new Error(fn);
      },
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: mockServer.row ? { ...mockServer.row } : null, error: null }) }),
        }),
      }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
  };
});
const mockPlaced: RouteStop[] = [
  { id: 's1', name: 'Cafe', day_number: 1, position: 1, lat: 5.4176, lng: 100.3332, planned_time: new Date(2026, 9, 12, 9, 0).toISOString(), planned_end: null, is_outdoor: false, status: 'planned' },
];
// The sample plan: times, but no places yet (what "Last trip" had).
const mockUnplaced = mockPlaced.map((x) => ({ ...x, lat: null, lng: null }));
const mockStops: { current: { data: RouteStop[]; base: RouteStop[]; isLoading: boolean } } = {
  current: { data: mockPlaced, base: mockPlaced, isLoading: false },
};
const mockOff = { data: undefined, base: undefined, isLoading: false };
jest.mock('@/features/demo/hooks/useDemoStops', () => ({
  useDemoStops: (trip?: string) => (trip ? mockStops.current : mockOff),
}));
jest.mock('@/features/trip/hooks/useTrip', () => {
  const me = { id: 'm1', display_name: 'Me' };
  const members = { data: [me] };
  return { useMembers: () => members, useMyMember: () => me };
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

/** The app root (DemoFrame) + Settings + the demo bar's replay, as on a phone. */
function usePhone() {
  useDemoSession();
  const actions = useDemoActions('t1');
  const enabled = useDemo((s) => s.enabled);
  // DemoFrame only shows the bar (and so the replay) while Demo mode is on.
  return { actions, enabled, replay: useDemoReplayWhen(enabled) };
}
// Hooks can't be called conditionally; the replay is harmless while off (no trip active).
const useDemoReplayWhen = (_on: boolean) => useDemoReplay();

beforeEach(() => {
  mockServer.row = null;
  mockServer.fail = null;
  mockServer.failInit = null;
  mockStops.current = { data: mockPlaced, base: mockPlaced, isLoading: false };
  setDemoSession(null, DEMO_OFF);
  useCurrentTrip.setState({ currentTripId: 't1' });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('turning Demo mode on (one phone)', () => {
  it('switches the app to the shared fake clock, 30 min before Day 1', async () => {
    const { result } = await renderHook(usePhone, { wrapper });
    await act(async () => {
      await result.current.actions.setEnabled(true);
    });
    await waitFor(() => expect(useDemo.getState().fakeTime).not.toBeNull());
    expect(now().getTime()).toBe(Date.parse(mockSTART) - 30 * 60_000);
    expect(useDemo.getState().enabled).toBe(true);
  });

  it('still starts the fake clock when the stops have times but no places (the sample plan)', async () => {
    mockStops.current = { data: mockUnplaced, base: mockUnplaced, isLoading: false };
    const { result } = await renderHook(usePhone, { wrapper });
    await act(async () => {
      await result.current.actions.setEnabled(true);
    });
    await waitFor(() => expect(useDemo.getState().fakeTime).not.toBeNull());
    expect(now().getTime()).toBe(Date.parse(mockSTART) - 30 * 60_000);
    expect(result.current.replay.readiness).toBe('clockOnly');
    expect(result.current.replay.route).toBeNull(); // no walk without places
  });

  it('shows on screen why the demo clock could not start, with Try again', async () => {
    mockServer.failInit = 'Not a member of this trip';
    const { result } = await renderHook(usePhone, { wrapper });
    await act(async () => {
      await result.current.actions.setEnabled(true);
    });
    // Demo mode is on, the clock call fails: the bar says so instead of quietly using the real time.
    expect(useDemo.getState().enabled).toBe(true);
    await waitFor(() =>
      expect(result.current.replay.initError).toBe(
        "Demo mode is on, but the demo clock couldn't start. You're not a member of this trip on this account.",
      ),
    );
    expect(useDemo.getState().fakeTime).toBeNull();
    // Try again once it works.
    mockServer.failInit = null;
    await act(async () => result.current.replay.retryInit());
    await waitFor(() => expect(useDemo.getState().fakeTime).not.toBeNull());
    expect(result.current.replay.initError).toBeNull();
  });

  it('shows a clear error when the server call fails', async () => {
    mockServer.fail = 'function demo_set_enabled(uuid, boolean) does not exist';
    const { result } = await renderHook(usePhone, { wrapper });
    await act(async () => {
      await result.current.actions.setEnabled(true);
    });
    expect(useDemo.getState().enabled).toBe(false);
    expect(result.current.actions.error).toBe(
      "Couldn't turn Demo mode on. Demo mode isn't set up on the server yet (run supabase/migrations/018_shared_demo.sql).",
    );
  });
});
