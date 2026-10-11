import { shouldKeep, weatherSummary, type WeatherSample } from '@/features/recap/dayWeather';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const MIN = 60_000;
const at = (h: number) => Date.parse('2026-10-12T00:00:00+08:00') + h * 60 * MIN;
const sample = (h: number, tempC: number, condition: string, kind: WeatherSample['kind'] = 'sunny'): WeatherSample => ({
  at: at(h),
  tempC,
  condition,
  kind,
});

describe('day weather summary', () => {
  it('is null with no readings', () => {
    expect(weatherSummary([])).toBeNull();
  });

  it('says the sky as it was all day, with the highest temperature', () => {
    expect(weatherSummary([sample(9, 29, 'sunny'), sample(13, 32, 'sunny')])).toEqual({ tempC: 32, words: 'sunny', kind: 'sunny' });
  });

  it('says "mostly" when the sky changed', () => {
    const s = weatherSummary([sample(9, 28, 'sunny'), sample(12, 31, 'sunny'), sample(16, 27, 'light rain', 'rain')]);
    expect(s).toEqual({ tempC: 31, words: 'mostly sunny', kind: 'sunny' });
  });

  it('ignores readings after the (fake) time', () => {
    expect(weatherSummary([sample(9, 28, 'sunny'), sample(15, 33, 'cloudy', 'cloudy')], at(10))?.tempC).toBe(28);
  });

  it('keeps a reading every 20 min, or straight away when the sky changes', () => {
    const list = [sample(9, 28, 'sunny')];
    expect(shouldKeep([], { condition: 'sunny' }, at(9))).toBe(true);
    expect(shouldKeep(list, { condition: 'sunny' }, at(9) + 10 * MIN)).toBe(false);
    expect(shouldKeep(list, { condition: 'sunny' }, at(9) + 20 * MIN)).toBe(true);
    expect(shouldKeep(list, { condition: 'light rain' }, at(9) + 5 * MIN)).toBe(true);
  });
});
