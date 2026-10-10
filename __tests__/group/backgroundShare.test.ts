import { fixAction, MIN_GAP_MS, NOTICES, type ShareConfig } from '@/features/group/backgroundShare';
import { backgroundSupported } from '@/lib/location';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).getTime();
const config: ShareConfig = { tripId: 't1', memberId: 'm1', from: at(8), to: at(18) };

describe('background sharing', () => {
  it('saves a fix inside the sharing window', () => {
    expect(fixAction(config, at(8), null)).toBe('save');
    expect(fixAction(config, at(12), at(11, 58))).toBe('save');
    expect(fixAction(config, at(18), null)).toBe('save');
  });

  it('stops outside the window, or when nothing is set to share', () => {
    expect(fixAction(config, at(7, 59), null)).toBe('stop');
    expect(fixAction(config, at(18, 1), null)).toBe('stop');
    expect(fixAction(null, at(12), null)).toBe('stop');
  });

  it('skips fixes that come in less than ~50 s after the last save', () => {
    expect(fixAction(config, at(12), at(12) - MIN_GAP_MS + 1000)).toBe('skip');
    expect(fixAction(config, at(12), at(12) - MIN_GAP_MS)).toBe('save');
  });

  it('turns the notification into a reminder once the last stop is finished', () => {
    expect(NOTICES.sharing.body).toBe('Until you tap Done for today.');
    expect(NOTICES.finished).toMatchObject({
      title: 'Still sharing your location',
      body: "Tap Done for today in TripTrail when you're finished",
    });
  });

  it("can't run in tests / Expo Go (not an Android build), so nothing is started", () => {
    expect(backgroundSupported()).toBe(false);
  });
});
