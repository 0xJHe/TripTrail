import { mergeSamples, weatherSummary, type WeatherSample } from '@/features/recap/dayWeather';
import { samplesOf } from '@/features/recap/hooks/useRecordDayWeather';
import type { WeatherKind, WeatherReply } from '@/supabase/functions/_shared/weather';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const MIN = 60_000;
const DAY = new Date(2026, 10, 11).getTime();
const at = (h: number) => DAY + h * 60 * MIN;

const KIND: Record<string, WeatherKind> = { sunny: 'sunny', cloudy: 'cloudy', 'partly cloudy': 'partly', 'light rain': 'rain', rain: 'rain' };
const sample = (h: number, tempC: number, condition: string, actual = true): WeatherSample => ({
  at: at(h),
  tempC,
  condition,
  kind: KIND[condition] ?? 'cloudy',
  actual,
});
const day = (...conditions: string[]) => conditions.map((c, i) => sample(9 + i, 28 + (i % 3), c));

describe('day weather summary', () => {
  it('is null with no readings', () => {
    expect(weatherSummary([])).toBeNull();
  });

  it('says the sky as it was all day, with the highest temperature', () => {
    expect(weatherSummary(day('cloudy', 'cloudy', 'cloudy'))).toEqual({ tempC: 30, words: 'cloudy', kind: 'cloudy' });
  });

  it('says "mostly …" when one sky held most of the day', () => {
    expect(weatherSummary(day('cloudy', 'sunny', 'cloudy', 'cloudy', 'partly cloudy', 'cloudy'))?.words).toBe('mostly cloudy');
  });

  it('says "…, then …" when it changed during the day', () => {
    expect(weatherSummary(day('sunny', 'sunny', 'sunny', 'light rain', 'rain', 'light rain'))?.words).toBe('sunny, then rain');
  });

  it('adds "some rain" to a mostly dry day that had a shower', () => {
    expect(weatherSummary(day('sunny', 'sunny', 'light rain', 'sunny', 'sunny'))?.words).toBe('mostly sunny, some rain');
  });

  it('ignores readings after the (fake) time', () => {
    expect(weatherSummary([sample(9, 28, 'sunny'), sample(15, 33, 'cloudy')], at(10))).toEqual({ tempC: 28, words: 'sunny', kind: 'sunny' });
  });

  it('takes the temperature from real readings when there are any', () => {
    expect(weatherSummary([sample(9, 27, 'cloudy'), sample(13, 34, 'cloudy', false)])?.tempC).toBe(27);
  });
});

describe('saving readings', () => {
  it('keeps one per hour, a real reading beating a forecast', () => {
    const forecast = sample(10, 30, 'sunny', false);
    const real = { ...sample(10, 27, 'cloudy'), at: at(10) + 20 * MIN };
    const merged = mergeSamples(mergeSamples([], [forecast]), [real]);
    expect(merged).toEqual([{ ...real, at: at(10) }]);
    expect(mergeSamples(merged, [forecast])).toEqual(merged);
  });

  it("reads the current weather and this day's forecast hours from a reply", () => {
    const w = (tempC: number, condition: string, kind: WeatherKind) => ({ tempC, condition, kind, windKmh: null, isDay: true, rainChance: null });
    const hour = (h: number, condition: string, kind: WeatherKind) => ({
      ...w(29, condition, kind),
      start: new Date(at(h)).toISOString(),
      end: new Date(at(h + 1)).toISOString(),
    });
    const reply: WeatherReply = {
      now: w(28, 'cloudy', 'cloudy'),
      next: hour(14, 'light rain', 'rain'),
      soon: [hour(12, 'cloudy', 'cloudy'), hour(40, 'sunny', 'sunny')],
      limited: false,
      weatherCalls: 0,
    };
    const got = samplesOf(reply, at(11.5), DAY);
    expect(got.map((s) => [s.condition, s.actual])).toEqual([
      ['cloudy', true],
      ['cloudy', false],
      ['light rain', false],
    ]);
  });
});
