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
  /** The day's typical temperature (median while out), °C. */
  tempC: number;
  /** "cloudy" (one reading), "mostly cloudy", "mostly sunny, some rain". */
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

/** Which readings describe the day: from the first to the last position, and not after the (fake) time. */
export interface SummaryWindow {
  /** First position (ms); readings before it don't count, if any fall in the window. */
  from?: number | null;
  /** Last position (ms). */
  to?: number | null;
  /** now() — Demo mode Reset forgets later readings. */
  until?: number;
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * The day as a whole, from its readings while out (first to last position; all of the day's if
 * none fall there): the typical temperature (median, rounded) and "mostly [most common sky]",
 * plus ", some rain" if any rain was seen. One reading: just its sky ("cloudy").
 * null = no readings.
 */
export function weatherSummary(samples: WeatherSample[], { from, to, until = Infinity }: SummaryWindow = {}): WeatherSummary | null {
  const known = samples.filter((s) => s.at <= until).sort((a, b) => a.at - b.at);
  // A reading counts for the hour it's in, so the hour the day started in counts too.
  const out = known.filter((s) => (from == null || s.at + HOUR > from) && (to == null || s.at <= to));
  const list = out.length > 0 ? out : known;
  if (list.length === 0) return null;
  const tempC = Math.round(median(list.map((s) => s.tempC)));
  const top = mostOf(list);
  if (list.length === 1) return { tempC, words: top.sky, kind: top.kind };
  const wet = list.some((s) => WET.includes(s.kind));
  // "partly cloudy" is already a mix: no "mostly" in front.
  const main = top.sky.startsWith('partly') ? top.sky : `mostly ${top.sky}`;
  return { tempC, words: wet && !/rain|storm|snow/.test(top.sky) ? `${main}, some rain` : main, kind: top.kind };
}
