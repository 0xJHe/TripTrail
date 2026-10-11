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

  it('says just the sky after a single reading', () => {
    expect(weatherSummary([sample(9, 27, 'cloudy')])).toEqual({ tempC: 27, words: 'cloudy', kind: 'cloudy' });
  });

  it('says "mostly [most common sky]" whenever there are several readings', () => {
    expect(weatherSummary(day('cloudy', 'cloudy', 'cloudy'))?.words).toBe('mostly cloudy');
    expect(weatherSummary(day('cloudy', 'sunny', 'cloudy', 'cloudy', 'partly cloudy', 'cloudy'))?.words).toBe('mostly cloudy');
    expect(weatherSummary(day('sunny', 'sunny', 'cloudy'))?.words).toBe('mostly sunny');
  });

  it('adds "some rain" if any rain was seen', () => {
    expect(weatherSummary(day('sunny', 'sunny', 'light rain', 'sunny', 'sunny'))?.words).toBe('mostly sunny, some rain');
    expect(weatherSummary(day('sunny', 'sunny', 'sunny', 'light rain', 'rain', 'light rain'))?.words).toBe('mostly sunny, some rain');
    expect(weatherSummary(day('rain', 'light rain', 'cloudy'))?.words).toBe('mostly rain');
  });

  it('keeps "partly cloudy" as it is (already a mix)', () => {
    expect(weatherSummary(day('partly cloudy', 'partly cloudy', 'sunny'))?.words).toBe('partly cloudy');
  });

  it('shows the typical temperature: the median while out, rounded', () => {
    const list = [sample(7, 24, 'cloudy'), sample(9, 27, 'cloudy'), sample(12, 33, 'sunny'), sample(15, 30, 'cloudy'), sample(22, 25, 'cloudy')];
    // Out 08:30 – 16:00: 27, 33, 30 -> 30 (not the highest, 33).
    expect(weatherSummary(list, { from: at(8.5), to: at(16) })?.tempC).toBe(30);
    // Even count: the middle two averaged, rounded.
    expect(weatherSummary([sample(9, 27, 'cloudy'), sample(10, 30, 'cloudy')])?.tempC).toBe(29);
  });

  it('counts the reading for the hour the day started in', () => {
    expect(weatherSummary([sample(8, 26, 'sunny'), sample(9, 28, 'sunny')], { from: at(8.5), to: at(9.5) })?.tempC).toBe(27);
  });

  it('uses all of the day\'s readings when none fall between the first and last position', () => {
    expect(weatherSummary([sample(6, 25, 'cloudy'), sample(7, 26, 'cloudy')], { from: at(9), to: at(17) })?.tempC).toBe(26);
  });

  it('ignores readings after the (fake) time', () => {
    expect(weatherSummary([sample(9, 28, 'sunny'), sample(15, 33, 'cloudy')], { until: at(10) })).toEqual({ tempC: 28, words: 'sunny', kind: 'sunny' });
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
      soon: [hour(11, 'partly cloudy', 'partly'), hour(12, 'cloudy', 'cloudy'), hour(40, 'sunny', 'sunny')],
      limited: false,
      weatherCalls: 0,
    };
    const got = samplesOf(reply, at(11.5), DAY);
    expect(got.map((x) => x.at)).toEqual([at(11.5), at(11), at(12), at(14)]);
    expect(got.map((s) => [s.condition, s.actual])).toEqual([
      ['cloudy', true],
      ['partly cloudy', false],
      ['cloudy', false],
      ['light rain', false],
    ]);
  });

  it('moves forecast hours onto the app clock (Demo mode), so a fake day still gets them', () => {
    const real = Date.parse('2026-10-12T00:30:00+08:00');
    const hour = (offsetH: number, condition: string, kind: WeatherKind) => ({
      tempC: 28,
      condition,
      kind,
      windKmh: null,
      isDay: true,
      rainChance: null,
      start: new Date(Math.floor(real / 3_600_000) * 3_600_000 + offsetH * 3_600_000).toISOString(),
      end: new Date(Math.floor(real / 3_600_000) * 3_600_000 + (offsetH + 1) * 3_600_000).toISOString(),
    });
    const reply: WeatherReply = {
      now: null,
      next: null,
      soon: [hour(0, 'cloudy', 'cloudy'), hour(1, 'sunny', 'sunny'), hour(2, 'light rain', 'rain')],
      limited: false,
      weatherCalls: 0,
    };
    // Fake time: 10:20 on the trip day.
    const got = samplesOf(reply, at(10 + 1 / 3), DAY);
    expect(got.map((x) => [x.at, x.condition])).toEqual([
      [at(10), 'cloudy'],
      [at(11), 'sunny'],
      [at(12), 'light rain'],
    ]);
  });
});
