import { now } from '@/lib/clock';
import { DEMO_OFF, isDemoMode, setDemoSession, useDemo } from '@/lib/demo';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const NINE_AM = new Date(2026, 9, 12, 9, 0).getTime();
const on = { ...DEMO_OFF, enabled: true, step: 3 };

beforeEach(() => {
  setDemoSession(null, DEMO_OFF);
});

describe('now()', () => {
  it('is the real time when Demo mode is off, even if a fake time is set', () => {
    setDemoSession('trip-1', { ...DEMO_OFF, fakeTime: NINE_AM });
    expect(Math.abs(now().getTime() - Date.now())).toBeLessThan(1000);
  });

  it("is the trip's shared fake time in Demo mode, and stays put until it moves", () => {
    setDemoSession('trip-1', { ...on, fakeTime: NINE_AM });
    expect(now().getTime()).toBe(NINE_AM);
    expect(now().getTime()).toBe(NINE_AM);
    expect(isDemoMode()).toBe(true);
    expect(useDemo.getState().tripId).toBe('trip-1');
  });

  it('follows the shared fake time when someone moves it', () => {
    setDemoSession('trip-1', { ...on, fakeTime: NINE_AM });
    setDemoSession('trip-1', { ...on, step: 4, fakeTime: NINE_AM + 15 * 60_000 });
    expect(now()).toEqual(new Date(2026, 9, 12, 9, 15));
  });

  it('is the real time in Demo mode until a phone has started the clock', () => {
    setDemoSession('trip-1', { ...on, fakeTime: null });
    expect(Math.abs(now().getTime() - Date.now())).toBeLessThan(1000);
  });
});
