import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Weather, WeatherKind } from '@/supabase/functions/_shared/weather';

/**
 * The day's weather for the recap card, from readings the Today card already fetched (saved
 * on the phone as they arrive, useRecordDayWeather). Never asks for weather itself.
 */

export interface WeatherSample {
  /** When (ms, lib/clock). */
  at: number;
  tempC: number;
  condition: string;
  kind: WeatherKind;
}

/** A new reading is kept at most this often, unless the sky changed. */
const EVERY_MS = 20 * 60_000;
const MAX_PER_DAY = 48;
const MAX_DAYS = 30;

const key = (tripId: string, day: number) => `${tripId}:${day}`;

interface DayWeatherState {
  /** `${tripId}:${day}` -> the day's readings. */
  days: Record<string, WeatherSample[]>;
  record: (tripId: string, day: number, w: Weather, t: number) => void;
}

export const useDayWeather = create<DayWeatherState>()(
  persist(
    (set) => ({
      days: {},
      record: (tripId, day, w, t) =>
        set((s) => {
          const k = key(tripId, day);
          const list = s.days[k] ?? [];
          if (!shouldKeep(list, w, t)) return s;
          const next = [...list, { at: t, tempC: w.tempC, condition: w.condition, kind: w.kind }].slice(-MAX_PER_DAY);
          const entries = Object.entries({ ...s.days, [k]: next }).slice(-MAX_DAYS);
          return { days: Object.fromEntries(entries) };
        }),
    }),
    { name: 'triptrail-day-weather', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** Keep a reading if it is the first, the sky changed, or the last one is 20+ min old. */
export function shouldKeep(list: WeatherSample[], w: Pick<Weather, 'condition'>, t: number): boolean {
  const last = list[list.length - 1];
  return !last || last.condition !== w.condition || Math.abs(t - last.at) >= EVERY_MS;
}

export const dayWeatherOf = (days: Record<string, WeatherSample[]>, tripId: string | undefined, day: number) =>
  tripId ? (days[key(tripId, day)] ?? []) : [];

export interface WeatherSummary {
  /** The day's highest, °C. */
  tempC: number;
  /** "mostly sunny", "light rain". */
  words: string;
  kind: WeatherKind;
}

/**
 * The day in a few words: its most common sky ("mostly …" when it changed during the day) and
 * the highest temperature. Readings after `until` (Demo mode Reset) don't count. null = none.
 */
export function weatherSummary(samples: WeatherSample[], until = Infinity): WeatherSummary | null {
  const list = samples.filter((s) => s.at <= until);
  if (list.length === 0) return null;
  const counts = new Map<string, { n: number; kind: WeatherKind }>();
  for (const s of list) {
    const c = counts.get(s.condition);
    counts.set(s.condition, { n: (c?.n ?? 0) + 1, kind: s.kind });
  }
  const [condition, top] = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  return {
    tempC: Math.max(...list.map((s) => s.tempC)),
    words: counts.size > 1 && !condition.startsWith('mostly') ? `mostly ${condition}` : condition,
    kind: top.kind,
  };
}
