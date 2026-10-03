import { addDays, rangeDates, type ISODate } from './dates';

export interface MemberDates {
  memberId: string;
  freeDates: ISODate[];
}

export interface DateWindow {
  start: ISODate;
  end: ISODate;
  days: number;
  /** Members free on every day of the window. */
  freeMemberIds: string[];
  freeCount: number;
  /** Everyone in the trip, including members who haven't answered yet. */
  total: number;
}

/**
 * Date finder: the `days`-long run of days that the most members are free for.
 * Ties go to the earliest window. `within` limits the search to fixed trip dates.
 * Returns null when nobody is free for that many days in a row.
 */
export function findBestWindow(
  members: MemberDates[],
  totalMembers: number,
  days: number,
  within?: { start: ISODate; end: ISODate },
): DateWindow | null {
  const free = members.map((m) => ({ id: m.memberId, dates: new Set(m.freeDates) }));
  const starts = new Set<ISODate>();
  for (const m of members) for (const d of m.freeDates) starts.add(d);
  if (within) {
    // With fixed dates the trip can only start on the first fixed day.
    starts.clear();
    starts.add(within.start);
  }

  let best: DateWindow | null = null;
  for (const start of [...starts].sort()) {
    const end = addDays(start, days - 1);
    if (within && end > within.end) continue;
    const window = rangeDates(start, end);
    const ids = free.filter((m) => window.every((d) => m.dates.has(d))).map((m) => m.id);
    if (ids.length === 0) continue;
    if (!best || ids.length > best.freeCount) {
      best = { start, end, days, freeMemberIds: ids, freeCount: ids.length, total: totalMembers };
    }
  }
  return best;
}

/** "all 4 of you are free", "only 3 of 4 free", "you're free". */
export function freeLabel(window: DateWindow): string {
  if (window.total <= 1) return "you're free";
  if (window.freeCount >= window.total) return window.total === 2 ? 'both of you are free' : `all ${window.total} of you are free`;
  return `only ${window.freeCount} of ${window.total} free`;
}

/** Short form for lists: "all 4 free", "only 3 free". */
export function freeLabelShort(window: DateWindow): string {
  if (window.total <= 1) return "you're free";
  if (window.freeCount >= window.total) return `all ${window.total} free`;
  return `only ${window.freeCount} free`;
}
