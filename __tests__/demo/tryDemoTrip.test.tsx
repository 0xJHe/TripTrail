// Settings > Try a demo trip: start_demo_trip -> the copy becomes the open trip -> its Day plan.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { startDemoTrip } from '@/features/demo/api';
import { TryDemoCard } from '@/features/demo/components/TryDemoCard';
import { demoTripReason } from '@/features/demo/errors';
import { useTryDemoTrip } from '@/features/demo/hooks/useTryDemoTrip';
import { fetchMadeUpMembers, fetchMembers } from '@/features/trip/api';
import { useCurrentTrip } from '@/features/trip/store';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ router: { replace: (to: string) => mockReplace(to) } }));
jest.mock('@/features/trip/authStore', () => ({ useDisplayName: () => 'Harein' }));

const mockServer = { fail: null as null | string, calls: [] as Record<string, unknown>[] };
const MEMBERS = [
  { id: 'm1', trip_id: 't9', user_id: 'u1', display_name: 'Harein', is_demo: false },
  { id: 'm2', trip_id: 't9', user_id: null, display_name: 'Aisha (demo)', is_demo: true },
];
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: async (fn: string, a: Record<string, unknown>) => {
      await new Promise((r) => setTimeout(r, 5));
      if (fn !== 'start_demo_trip') throw new Error(fn);
      mockServer.calls.push(a);
      if (mockServer.fail) return { data: null, error: { message: mockServer.fail } };
      return { data: { trip_id: 't9', created: mockServer.calls.length === 1 }, error: null };
    },
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: MEMBERS, error: null }) }) }),
    }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockServer.fail = null;
  mockServer.calls = [];
  mockReplace.mockClear();
  useCurrentTrip.setState({ currentTripId: 'other-trip' });
});

describe('Try a demo trip', () => {
  it('asks the server for a copy in my name and reads what it did', async () => {
    await expect(startDemoTrip('Harein')).resolves.toEqual({ tripId: 't9', created: true });
    expect(mockServer.calls).toEqual([{ p_name: 'Harein' }]);
    // The second time, the server finds my unfinished copy.
    await expect(startDemoTrip('Harein')).resolves.toEqual({ tripId: 't9', created: false });
  });

  it('opens the copy: it becomes the open trip and the Day plan shows', async () => {
    const { result } = await renderHook(() => useTryDemoTrip(), { wrapper });
    await act(async () => result.current.start());
    expect(useCurrentTrip.getState().currentTripId).toBe('t9');
    expect(mockReplace).toHaveBeenCalledWith('/plan');
    expect(result.current.error).toBeNull();
  });

  it('two quick taps ask once', async () => {
    const { result } = await renderHook(() => useTryDemoTrip(), { wrapper });
    await act(async () => { await Promise.all([result.current.start(), result.current.start()]); });
    expect(mockServer.calls).toHaveLength(1);
  });

  it('says so in plain words when the server has no demo trip yet, and stays put', async () => {
    mockServer.fail = 'The demo trip is not set up yet';
    const { result } = await renderHook(() => useTryDemoTrip(), { wrapper });
    await act(async () => result.current.start());
    expect(result.current.error).toBe(
      "The demo trip isn't set up on the server yet (run supabase/migrations/019_demo_trip.sql, then supabase/seed_demo_trip.sql).",
    );
    expect(useCurrentTrip.getState().currentTripId).toBe('other-trip');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('words other failures', () => {
    expect(demoTripReason(new Error('Could not find the function public.start_demo_trip(p_name)'))).toMatch(/isn't set up/);
    expect(demoTripReason(new Error('Network request failed'))).toBe("Couldn't open the demo trip. Check the connection and try again.");
    expect(demoTripReason(new Error('Please sign in first'))).toBe('Please sign in first.');
  });

  it('shows the button with its one-line explanation in Settings', async () => {
    await render(<TryDemoCard />, { wrapper });
    expect(screen.getByText('A ready-made trip you can explore with Demo mode')).toBeTruthy();
    fireEvent.press(screen.getByTestId('try-demo-trip'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/plan'));
  });
});

describe('made-up members', () => {
  it('are never real members, but can be listed on their own', async () => {
    expect((await fetchMembers('t9')).map((m) => m.display_name)).toEqual(['Harein']);
    expect((await fetchMadeUpMembers('t9')).map((m) => m.display_name)).toEqual(['Aisha (demo)']);
  });
});
