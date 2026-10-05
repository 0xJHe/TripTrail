// Refreshing an expired option photo: once per photo per app session, drawing on failure.
// The Edge Function call is faked; no Supabase or Google requests.
import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { OptionPhoto } from '@/lib/ai';
import { refreshOptionPhoto } from '@/features/planning/api';
import { useOptionPhoto } from '@/features/planning/hooks/useOptionPhoto';
import { freshPhoto, photoPlaceId, resetPhotoRefresh } from '@/features/planning/photoRefresh';
import type { OptionPlan } from '@/features/planning/types';

jest.mock('@/features/planning/api', () => ({ refreshOptionPhoto: jest.fn() }));
const refresh = refreshOptionPhoto as jest.MockedFunction<typeof refreshOptionPhoto>;

const oldPhoto: OptionPhoto = { url: 'https://lh3.example/old.jpg', credit: 'Ana Lim', creditUrl: null };
const newPhoto: OptionPhoto = { url: 'https://lh3.example/new.jpg', credit: 'Ana Lim', creditUrl: null };

const plan = (extra: Partial<OptionPlan> = {}): OptionPlan => ({
  days: 3,
  scene: 'heritage',
  covers: [],
  avoids: [],
  halal: true,
  dayTitles: ['George Town'],
  landmark: 'Kek Lok Si Temple, Penang',
  placeId: 'ChIJkek',
  photo: oldPhoto,
  ...extra,
});

beforeEach(() => {
  resetPhotoRefresh();
  refresh.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('photoPlaceId', () => {
  it('uses the saved place ID, or the one older options kept on the photo', () => {
    expect(photoPlaceId(plan())).toBe('ChIJkek');
    expect(photoPlaceId(plan({ placeId: null, photo: { ...oldPhoto, placeId: 'ChIJold' } }))).toBe('ChIJold');
    expect(photoPlaceId(plan({ placeId: null }))).toBeNull();
  });
});

describe('freshPhoto', () => {
  it('asks the Edge Function only once per photo per session', async () => {
    refresh.mockResolvedValue(newPhoto);
    expect(await freshPhoto('trip-1', 'ChIJkek')).toEqual(newPhoto);
    expect(await freshPhoto('trip-1', 'ChIJkek')).toEqual(newPhoto);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('trip-1', 'ChIJkek');
  });

  it('gives null on failure and does not try that photo again', async () => {
    refresh.mockRejectedValue(new Error('Edge Function returned 502'));
    expect(await freshPhoto('trip-1', 'ChIJkek')).toBeNull();
    expect(await freshPhoto('trip-1', 'ChIJkek')).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('useOptionPhoto', () => {
  it('shows the saved photo while it loads fine', async () => {
    const { result } = await renderHook(() => useOptionPhoto('trip-1', plan()));
    expect(result.current.photo).toEqual(oldPhoto);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('swaps in a fresh link when the saved one fails', async () => {
    let reply!: (p: OptionPhoto | null) => void;
    refresh.mockReturnValue(new Promise((resolve) => (reply = resolve)));
    const { result } = await renderHook(() => useOptionPhoto('trip-1', plan()));
    await act(async () => result.current.onError());
    expect(result.current.photo).toBeNull(); // drawing while it asks
    await act(async () => reply(newPhoto));
    await waitFor(() => expect(result.current.photo).toEqual(newPhoto));
  });

  it('keeps the drawing if the fresh link fails too, with no second refresh', async () => {
    refresh.mockResolvedValue(newPhoto);
    const { result } = await renderHook(() => useOptionPhoto('trip-1', plan()));
    await act(async () => result.current.onError());
    await waitFor(() => expect(result.current.photo).toEqual(newPhoto));
    await act(async () => result.current.onError());
    expect(result.current.photo).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the drawing when the refresh fails or the limit is reached', async () => {
    refresh.mockResolvedValue(null);
    const { result } = await renderHook(() => useOptionPhoto('trip-1', plan()));
    await act(async () => result.current.onError());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(result.current.photo).toBeNull();
  });

  it('keeps the drawing without asking when there is no place ID', async () => {
    const { result } = await renderHook(() => useOptionPhoto('trip-1', plan({ placeId: null })));
    await act(async () => result.current.onError());
    expect(result.current.photo).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a second card for the same photo (Results screen) reuses the first refresh', async () => {
    refresh.mockResolvedValue(newPhoto);
    const swipe = await renderHook(() => useOptionPhoto('trip-1', plan()));
    await act(async () => swipe.result.current.onError());
    await waitFor(() => expect(swipe.result.current.photo).toEqual(newPhoto));
    const results = await renderHook(() => useOptionPhoto('trip-1', plan()));
    await act(async () => results.result.current.onError());
    await waitFor(() => expect(results.result.current.photo).toEqual(newPhoto));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
