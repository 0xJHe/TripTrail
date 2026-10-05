import { haversineMeters, type LatLng } from '@/lib/distance';
import { rainSoonAt, type DemoRoute } from '@/lib/location';
import { windWords, type Weather, type WeatherKind } from '@/supabase/functions/_shared/weather';

/** Demo mode rain at a point: falling at t, or coming within the hour. */
export type DemoRain = 'now' | 'soon' | null;

/** Demo mode: is the route's rain moment over this point at time t? */
export function demoRainAt(route: DemoRoute | null, p: LatLng, t: number): DemoRain {
  if (!route) return null;
  const falling = route.rain.some((r) => r.startsAt <= t && t <= r.endsAt && haversineMeters(p, r) <= r.radiusM);
  if (falling) return 'now';
  return rainSoonAt(route, p, t) ? 'soon' : null;
}

export interface WeatherText {
  text: string;
  kind: WeatherKind;
}

/** "32° · sunny · light breeze". Demo rain replaces the sky: "29° · rain", "29° · rain soon". */
export function nowWeatherText(w: Weather | null, rain: DemoRain = null): WeatherText | null {
  if (rain) {
    const sky = rain === 'now' ? 'rain' : 'rain within the hour';
    return { text: w ? `${w.tempC}° · ${sky}` : capital(sky), kind: 'rain' };
  }
  if (!w) return null;
  return { text: [`${w.tempC}°`, w.condition, windWords(w.windKmh)].filter(Boolean).join(' · '), kind: w.kind };
}

/** "29° · cloudy at 14:00". */
export function nextWeatherText(w: Weather | null, clock: string, rain: DemoRain = null): WeatherText | null {
  const at = clock ? ` at ${clock}` : '';
  if (rain) return { text: w ? `${w.tempC}° · rain${at}` : `Rain${at}`, kind: 'rain' };
  if (!w) return null;
  return { text: `${w.tempC}° · ${w.condition}${at}`, kind: w.kind };
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
