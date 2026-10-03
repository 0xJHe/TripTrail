import { addMonths, monthKey, monthLabel, todayISO, type MonthKey } from '@/features/planning/dates';

export interface LengthChoice {
  value: string;
  label: string;
  min: number;
  max: number;
}

export const LENGTHS: LengthChoice[] = [
  { value: '1-1', label: '1 day', min: 1, max: 1 },
  { value: '2-3', label: '2 – 3 days', min: 2, max: 3 },
  { value: '4-5', label: '4 – 5 days', min: 4, max: 5 },
  { value: '6-7', label: '6 – 7 days', min: 6, max: 7 },
];

export const DEFAULT_LENGTH = LENGTHS[1];

export function lengthLabel(min: number | null, max: number | null): string {
  const found = LENGTHS.find((l) => l.min === min && l.max === max);
  if (found) return found.label;
  if (!max) return '';
  return !min || min === max ? `${max} day${max === 1 ? '' : 's'}` : `${min} – ${max} days`;
}

/** This month and the next 11, for the Month picker. */
export function upcomingMonths(now: Date = new Date()): { value: MonthKey; label: string }[] {
  const first = monthKey(todayISO(now));
  return Array.from({ length: 12 }, (_, i) => {
    const key = addMonths(first, i);
    return { value: key, label: monthLabel(key) };
  });
}
