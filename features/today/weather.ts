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

/** Daytime on the trip clock: 07:00 to 19:00 (Malaysia sunrise / sunset, roughly). */
const DAY_FROM_HOUR = 7;
const NIGHT_FROM_HOUR = 19;

/**
 * Sun or moon for the hour on lib/clock (Demo mode's fake time), not the real time
 * the weather was fetched at: clear at night is a moon, clear by day a sun.
 */
export function skyAt(kind: WeatherKind, condition: string, hour: number): WeatherKind {
  const day = hour >= DAY_FROM_HOUR && hour < NIGHT_FROM_HOUR;
  if (kind === 'clear-night' && day) return /cloud/.test(condition) ? 'partly' : 'sunny';
  if ((kind === 'sunny' || kind === 'partly') && !day) return 'clear-night';
  return kind;
}

export interface WeatherText {
  text: string;
  kind: WeatherKind;
}

/**
 * "32° · sunny · light breeze". Demo rain replaces the sky: "29° · rain", "29° · rain soon".
 * `hour` = now() on lib/clock, for the sun / moon icon.
 */
export function nowWeatherText(w: Weather | null, rain: DemoRain = null, hour?: number): WeatherText | null {
  if (rain) {
    const sky = rain === 'now' ? 'rain' : 'rain within the hour';
    return { text: w ? `${w.tempC}° · ${sky}` : capital(sky), kind: 'rain' };
  }
  if (!w) return null;
  const kind = hour == null ? w.kind : skyAt(w.kind, w.condition, hour);
  return { text: [`${w.tempC}°`, w.condition, windWords(w.windKmh)].filter(Boolean).join(' · '), kind };
}

/** "29° · cloudy at 14:00". `hour` = the stop's planned hour, for the sun / moon icon. */
export function nextWeatherText(w: Weather | null, clock: string, rain: DemoRain = null, hour?: number): WeatherText | null {
  const at = clock ? ` at ${clock}` : '';
  if (rain) return { text: w ? `${w.tempC}° · rain${at}` : `Rain${at}`, kind: 'rain' };
  if (!w) return null;
  return { text: `${w.tempC}° · ${w.condition}${at}`, kind: hour == null ? w.kind : skyAt(w.kind, w.condition, hour) };
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
