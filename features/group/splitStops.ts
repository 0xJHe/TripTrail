import { clockOf } from '@/features/planning/stops';
import type { MeetPointRow } from './types';

/**
 * Group B's own stops during a split (Split & rejoin, "+ Add a stop"). A stop with a
 * split_id belongs to that split's group B only: it shows on their Today card and plan
 * ("Group B" tag), only their phones tick it off and ask the spend check, and group A never
 * sees it. Times are the phone's now() (the fake time in Demo mode).
 */

type SplitRow = Pick<MeetPointRow, 'id' | 'group_b' | 'set_at' | 'created_at' | 'status' | 'ended_at' | 'rejoin_at'>;
type SplitStop = { id: string; split_id?: string | null; status: string };

const setAt = (r: SplitRow) => Date.parse(r.set_at ?? r.created_at);

/** The split has ended at time t (back together or ended by hand). */
export function splitEnded(row: SplitRow, t: number): boolean {
  if (row.status === 'active' || !row.ended_at) return false;
  return Date.parse(row.ended_at) <= t;
}

/**
 * Can this person see the stop at time t? Main-plan stops: always. Group B stops: only the
 * split's group B, once the split was set (so Demo mode's Reset hides them), and once the
 * split has ended only the ones they already visited (anything still planned is gone:
 * everyone continues the normal plan).
 */
export function canSeeStop(stop: SplitStop, splits: SplitRow[], meId: string | null, t: number): boolean {
  if (!stop.split_id) return true;
  const row = splits.find((r) => r.id === stop.split_id);
  if (!row || !meId || setAt(row) > t) return false;
  if (!row.group_b.some((m) => m.id === meId)) return false;
  return !(splitEnded(row, t) && stop.status === 'planned');
}

/** Ids of the stops this person can't see at time t (as a stable key, so lists only change when it does). */
export function hiddenStopsKey(stops: SplitStop[], splits: SplitRow[], meId: string | null, t: number): string {
  return stops
    .filter((s) => !canSeeStop(s, splits, meId, t))
    .map((s) => s.id)
    .sort()
    .join(',');
}

/**
 * The shared plan without group B's stops. The running-late, running-early and rain checks
 * use only this, so their new days never move a group B stop and group A's plan never changes.
 */
export function mainPlan<S extends { split_id?: string | null }>(stops: S[]): S[] {
  return stops.some((s) => s.split_id) ? stops.filter((s) => !s.split_id) : stops;
}

/** How many people a stop's spend check asks: the split's group B, else the whole group. */
export function stopGroupSize(stop: { split_id?: string | null }, splits: SplitRow[], groupSize: number): number {
  if (!stop.split_id) return groupSize;
  return splits.find((r) => r.id === stop.split_id)?.group_b.length ?? groupSize;
}

/**
 * What's wrong with a group B stop's times (planned start / end ISO): it must start and end
 * before the rejoin time. Null when fine.
 */
export function splitStopProblem(start: string, end: string, rejoinAt: string | null): string | null {
  if (!rejoinAt) return null;
  const at = Date.parse(rejoinAt);
  if (Date.parse(start) >= at || Date.parse(end) > at) return `Group B stops must end by the rejoin time, ${clockOf(rejoinAt)}`;
  return null;
}
