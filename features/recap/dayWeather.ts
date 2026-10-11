import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { WeatherKind } from '@/supabase/functions/_shared/weather';

/**
 * The day's weather for the recap card, from what the Today card already fetched (saved on
 * the phone as it arrives, useRecordDayWeather): the current weather, and the forecast hours
 * that came with it. One reading per hour; a real reading beats a forecast for that hour.
 * Never asks for weather itself.
 */

export interface WeatherSample {
  /** Start of the hour (ms). */
  at: number;
  tempC: number;
  condition: string;
  kind: WeatherKind;
  /** false = a forecast for that hour (replaced by a real reading when one comes). */
  actual: boolean;
}

const HOUR = 3_600_000;
const MAX_DAYS = 30;

const key = (tripId: string, day: number) => `${tripId}:${day}`;
export const hourOf = (t: number) => Math.floor(t / HOUR) * HOUR;

/** Adds readings to a day's list (one per hour, real ones win), in time order. */
export function mergeSamples(list: WeatherSample[], add: WeatherSample[]): WeatherSample[] {
  const byHour = new Map(list.map((s) => [s.at, s]));
  for (const s of add) {
    const at = hourOf(s.at);
    const old = byHour.get(at);
    if (old?.actual && !s.actual) continue;
    byHour.set(at, { ...s, at });
  }
  return [...byHour.values()].sort((a, b) => a.at - b.at);
}

interface DayWeatherState {
  /** `${tripId}:${day}` -> the day's readings. */
  days: Record<string, WeatherSample[]>;
  record: (tripId: string, day: number, add: WeatherSample[]) => void;
}

export const useDayWeather = create<DayWeatherState>()(
  persist(
    (set) => ({
      days: {},
      record: (tripId, day, add) =>
        set((s) => {
          if (add.length === 0) return s;
          const k = key(tripId, day);
          const entries = Object.entries({ ...s.days, [k]: mergeSamples(s.days[k] ?? [], add) }).slice(-MAX_DAYS);
          return { days: Object.fromEntries(entries) };
        }),
    }),
    { name: 'triptrail-day-weather-hours', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export const dayWeatherOf = (days: Record<string, WeatherSample[]>, tripId: string | undefined, day: number) =>
  tripId ? (days[key(tripId, day)] ?? []) : [];

export interface WeatherSummary {
  /** The day's highest, °C. */
  tempC: number;
  /** "sunny", "mostly cloudy", "sunny, then rain", "mostly sunny, some rain". */
  words: string;
  kind: WeatherKind;
}

const WET: WeatherKind[] = ['rain', 'storm', 'snow'];

/** The sky in a word or two: "light rain" -> "rain", "partly cloudy" stays. */
function sky(s: WeatherSample): string {
  if (s.kind === 'storm') return 'storms';
  if (WET.includes(s.kind)) return s.kind === 'snow' ? 'snow' : 'rain';
  if (s.kind === 'clear-night') return 'clear';
  if (s.kind === 'sunny') return 'sunny';
  return s.condition.replace(/^mostly /, '');
}

function mostOf(list: WeatherSample[]): { sky: string; share: number; kind: WeatherKind } {
  const counts = new Map<string, { n: number; kind: WeatherKind }>();
  for (const s of list) {
    const k = sky(s);
    counts.set(k, { n: (counts.get(k)?.n ?? 0) + 1, kind: s.kind });
  }
  const [top, c] = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  return { sky: top, share: c.n / list.length, kind: c.kind };
}

/**
 * The day in a few words, from its readings in time order (up to `until`, so Demo mode Reset
 * forgets later ones): "cloudy" (all day), "sunny, then rain" (it changed around the middle),
 * "mostly cloudy" (one sky most of the day), plus ", some rain" when it rained a bit.
 * Temperature: the highest real reading (the forecasts' if there were none). null = no readings.
 */
export function weatherSummary(samples: WeatherSample[], until = Infinity): WeatherSummary | null {
  const list = samples.filter((s) => s.at <= until).sort((a, b) => a.at - b.at);
  if (list.length === 0) return null;
  const real = list.filter((s) => s.actual);
  const tempC = Math.max(...(real.length > 0 ? real : list).map((s) => s.tempC));
  const all = mostOf(list);
  const wet = list.some((s) => WET.includes(s.kind));
  const withRain = (w: string) => (wet && !/rain|storm|snow/.test(w) ? `${w}, some rain` : w);
  if (all.share === 1) return { tempC, words: all.sky, kind: all.kind };

  if (list.length >= 2) {
    const half = Math.ceil(list.length / 2);
    const early = mostOf(list.slice(0, half));
    const late = mostOf(list.slice(half));
    if (early.sky !== late.sky && early.share >= 0.6 && late.share >= 0.6) {
      return { tempC, words: `${early.sky}, then ${late.sky}`, kind: late.kind };
    }
  }
  return { tempC, words: withRain(all.share >= 0.5 ? `mostly ${all.sky}` : `${all.sky}, changeable`), kind: all.kind };
}
