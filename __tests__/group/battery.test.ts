import { act, renderHook } from '@testing-library/react-native';
import * as Battery from 'expo-battery';

import {
  BATTERY_READ_EVERY_MS,
  batteryPercent,
  bigBatteryChange,
  readBattery,
  useBatteryPercent,
} from '@/features/group/battery';

jest.mock('expo-battery', () => ({
  getBatteryLevelAsync: jest.fn(),
  addBatteryLevelListener: jest.fn(() => ({ remove: jest.fn() })),
}));

const level = Battery.getBatteryLevelAsync as jest.Mock;

describe('batteryPercent', () => {
  it('rounds the 0–1 level to a whole %', () => {
    // Android sends 57/100 as a float: 0.5699999928474426 is 57 %, not 56.
    expect(batteryPercent(Math.fround(0.57))).toBe(57);
    expect(batteryPercent(0.835)).toBe(84);
    expect(batteryPercent(1)).toBe(100);
    expect(batteryPercent(0)).toBe(0);
  });

  it('is null when the phone can not tell', () => {
    expect(batteryPercent(-1)).toBeNull();
    expect(batteryPercent(NaN)).toBeNull();
  });
});

describe('bigBatteryChange', () => {
  it('is true for a change of 5% or more, either way', () => {
    expect(bigBatteryChange(80, 75)).toBe(true);
    expect(bigBatteryChange(40, 46)).toBe(true);
    expect(bigBatteryChange(80, 76)).toBe(false);
    expect(bigBatteryChange(80, 80)).toBe(false);
  });

  it('is true when nothing was shared yet, false when the level is unknown', () => {
    expect(bigBatteryChange(null, 50)).toBe(true);
    expect(bigBatteryChange(50, null)).toBe(false);
  });
});

describe('readBattery', () => {
  it('reads the level now', async () => {
    level.mockResolvedValueOnce(0.42);
    await expect(readBattery()).resolves.toBe(42);
  });

  it('is null when reading fails', async () => {
    level.mockRejectedValueOnce(new Error('no battery'));
    await expect(readBattery()).resolves.toBeNull();
  });
});

describe('useBatteryPercent', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reads the battery again every 20 s, so the shown % keeps up with the phone', async () => {
    level.mockResolvedValue(0.8);
    const { result, unmount } = await renderHook(() => useBatteryPercent());
    await act(async () => {});
    expect(result.current).toBe(80);

    level.mockResolvedValue(0.79);
    await act(async () => {
      jest.advanceTimersByTime(BATTERY_READ_EVERY_MS);
    });
    expect(result.current).toBe(79);

    level.mockResolvedValue(0.7);
    await act(async () => {
      jest.advanceTimersByTime(BATTERY_READ_EVERY_MS);
    });
    expect(result.current).toBe(70);
    await unmount();
  });

  it('keeps the last known % when a reading is unknown', async () => {
    level.mockResolvedValue(0.5);
    const { result, unmount } = await renderHook(() => useBatteryPercent());
    await act(async () => {});
    level.mockResolvedValue(-1);
    await act(async () => {
      jest.advanceTimersByTime(BATTERY_READ_EVERY_MS);
    });
    expect(result.current).toBe(50);
    await unmount();
  });
});
