// Calendar dates as 'YYYY-MM-DD' strings and months as 'YYYY-MM'.
// All maths is done in UTC so time zones never shift a day.

export type ISODate = string;
export type MonthKey = string;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(year: number, month: number, day: number): ISODate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function toUTC(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(date: Date): ISODate {
  return toISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** Today's date on the phone's own calendar. */
export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function monthKey(iso: ISODate): MonthKey {
  return iso.slice(0, 7);
}

export function addMonths(key: MonthKey, n: number): MonthKey {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** "October 2026" */
export function monthLabel(key: MonthKey): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "October" */
export function monthName(key: MonthKey): string {
  return MONTHS[Number(key.split('-')[1]) - 1];
}

export function daysInMonth(key: MonthKey): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayMon0(iso: ISODate): number {
  return (toUTC(iso).getUTCDay() + 6) % 7;
}

/** Every date from start to end, inclusive. */
export function rangeDates(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

function dayMonth(iso: ISODate): { day: number; mon: string; year: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { day: d, mon: MONTHS[m - 1].slice(0, 3), year: y };
}

/** "12 – 14 Oct", "30 Oct – 2 Nov", "12 Oct". */
export function formatRange(start: ISODate, end: ISODate): string {
  const a = dayMonth(start);
  const b = dayMonth(end);
  if (start === end) return `${a.day} ${a.mon}`;
  if (a.year !== b.year) return `${a.day} ${a.mon} ${a.year} – ${b.day} ${b.mon} ${b.year}`;
  if (a.mon === b.mon) return `${a.day} – ${b.day} ${b.mon}`;
  return `${a.day} ${a.mon} – ${b.day} ${b.mon}`;
}

/** Group dates into runs of consecutive days. */
export function toRanges(dates: ISODate[]): { start: ISODate; end: ISODate }[] {
  const sorted = [...new Set(dates)].sort();
  const ranges: { start: ISODate; end: ISODate }[] = [];
  for (const d of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && addDays(last.end, 1) === d) last.end = d;
    else ranges.push({ start: d, end: d });
  }
  return ranges;
}

/** Short label for a set of picked days: "11 – 14 Oct", "11 – 14 Oct, 20 Oct", "… +2 more". */
export function summarizeDates(dates: ISODate[]): string {
  const ranges = toRanges(dates);
  if (ranges.length === 0) return '';
  const shown = ranges.slice(0, 2).map((r) => formatRange(r.start, r.end));
  const more = ranges.length - shown.length;
  return more > 0 ? `${shown.join(', ')} +${more} more` : shown.join(', ');
}
