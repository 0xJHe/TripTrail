import { advanceFakeTime, now, resetFakeTime, setFakeTime } from '@/lib/clock';
import { useDemo } from '@/lib/demo';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const NINE_AM = new Date(2026, 9, 12, 9, 0).getTime();

beforeEach(() => {
  useDemo.setState({ enabled: false, fakeTime: null, anchor: null });
});

describe('now()', () => {
  it('is the real time when Demo mode is off, even if a fake time is set', () => {
    useDemo.setState({ fakeTime: NINE_AM });
    expect(Math.abs(now().getTime() - Date.now())).toBeLessThan(1000);
  });

  it('is the fake time in Demo mode, and stays put until moved', () => {
    useDemo.getState().setEnabled(true);
    setFakeTime(NINE_AM, 'trip-1');
    expect(now().getTime()).toBe(NINE_AM);
    expect(now().getTime()).toBe(NINE_AM);
    expect(useDemo.getState().anchor).toBe('trip-1');
  });

  it('+15 min moves the fake time forward', () => {
    useDemo.getState().setEnabled(true);
    setFakeTime(NINE_AM);
    advanceFakeTime(15);
    advanceFakeTime(15);
    expect(now()).toEqual(new Date(2026, 9, 12, 9, 30));
  });

  it('turning Demo mode on starts the fake clock at the real time', () => {
    useDemo.getState().setEnabled(true);
    expect(useDemo.getState().fakeTime).not.toBeNull();
    expect(Math.abs(now().getTime() - Date.now())).toBeLessThan(1000);
  });

  it('Reset forgets which trip the time was set for, so the replay starts over', () => {
    useDemo.getState().setEnabled(true);
    setFakeTime(NINE_AM, 'trip-1');
    resetFakeTime();
    expect(useDemo.getState().anchor).toBeNull();
  });

  it('turning Demo mode off clears the fake time', () => {
    useDemo.getState().setEnabled(true);
    setFakeTime(NINE_AM, 'trip-1');
    useDemo.getState().setEnabled(false);
    expect(useDemo.getState()).toMatchObject({ enabled: false, fakeTime: null, anchor: null });
  });
});
