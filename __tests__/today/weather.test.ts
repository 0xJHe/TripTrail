import { buildDemoRoute, type RouteStop } from '@/features/demo/route';
import { demoRainAt, nextWeatherText, nowWeatherText } from '@/features/today/weather';
import type { Weather } from '@/supabase/functions/_shared/weather';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const MIN = 60_000;
const sunny: Weather = { tempC: 32, condition: 'sunny', kind: 'sunny', windKmh: 9, isDay: true, rainChance: 10 };
const cloudy: Weather = { tempC: 29, condition: 'cloudy', kind: 'cloudy', windKmh: 2, isDay: true, rainChance: 30 };

describe('weather lines', () => {
  it('Now: "32° · sunny · light breeze"', () => {
    expect(nowWeatherText(sunny)).toEqual({ text: '32° · sunny · light breeze', kind: 'sunny' });
  });

  it('Next: "29° · cloudy at 14:00"', () => {
    expect(nextWeatherText(cloudy, '14:00')).toEqual({ text: '29° · cloudy at 14:00', kind: 'cloudy' });
  });

  it('no weather (failed or limit reached) = no line', () => {
    expect(nowWeatherText(null)).toBeNull();
    expect(nextWeatherText(null, '14:00')).toBeNull();
  });

  it('demo rain replaces the sky but keeps the real temperature', () => {
    expect(nowWeatherText(sunny, 'now')).toEqual({ text: '32° · rain', kind: 'rain' });
    expect(nowWeatherText(sunny, 'soon')).toEqual({ text: '32° · rain within the hour', kind: 'rain' });
    expect(nextWeatherText(cloudy, '14:00', 'soon')).toEqual({ text: '29° · rain at 14:00', kind: 'rain' });
  });

  it('demo rain still shows when the weather call failed', () => {
    expect(nowWeatherText(null, 'now')).toEqual({ text: 'Rain', kind: 'rain' });
    expect(nextWeatherText(null, '14:00', 'now')).toEqual({ text: 'Rain at 14:00', kind: 'rain' });
  });
});

describe('demoRainAt', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).toISOString();
  const stops: RouteStop[] = [
    ['Toh Soon Cafe', 5.4176, 100.3332, at(8, 30), at(9, 15), false],
    ['Penang Hill', 5.4249, 100.269, at(10), at(12), true],
    ['Gurney Drive hawkers', 5.438, 100.31, at(12, 45), at(13, 45), false],
    ['Kek Lok Si', 5.3998, 100.2734, at(14, 30), at(16), true],
  ].map(([name, lat, lng, from, to, outdoor], i) => ({
    id: `s${i}`,
    name: name as string,
    day_number: 1,
    position: i,
    lat: lat as number,
    lng: lng as number,
    planned_time: from as string,
    planned_end: to as string,
    is_outdoor: outdoor as boolean,
    status: 'planned' as const,
  }));
  const route = buildDemoRoute({ tripId: 't1', day: 1, stops, members: [], meId: 'me' })!;
  const zone = route.rain[0];
  const centre = { lat: zone.lat, lng: zone.lng };

  it('is "soon" before the rain moment, "now" during it, null after and far away', () => {
    expect(demoRainAt(route, centre, zone.startsAt - 30 * MIN)).toBe('soon');
    expect(demoRainAt(route, centre, zone.startsAt + MIN)).toBe('now');
    expect(demoRainAt(route, centre, zone.endsAt + MIN)).toBeNull();
    expect(demoRainAt(route, { lat: 3.14, lng: 101.69 }, zone.startsAt + MIN)).toBeNull();
  });

  it('is null outside Demo mode', () => {
    expect(demoRainAt(null, centre, zone.startsAt + MIN)).toBeNull();
  });
});
