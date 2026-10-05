import type { Stop, StopStatus } from '@/features/planning/types';

/** The parts of a stop the arrive / leave rules read. */
export type VisitStop = Pick<Stop, 'id' | 'lat' | 'lng' | 'status' | 'arrived_at' | 'left_at'>;

/** A stop's visit, to save. `from` = the status it must still have (so two phones don't both write it). */
export interface VisitChange {
  stopId: string;
  from: StopStatus;
  status: StopStatus;
  arrived_at: string | null;
  left_at: string | null;
}

/** What the Today tab shows. */
export type TodayView =
  | { kind: 'no-plan'; reason: 'not-built' | 'before' | 'after' | 'empty'; day: number; startsOn: string; endsOn: string; daysToGo: number }
  | {
      kind: 'day';
      day: number;
      date: string;
      /** The stop the group is at. */
      now: Stop | null;
      /** The next stop still to visit. */
      next: Stop | null;
      /** The one after `next` (shown as Next when `now` is empty and `next` fills the navy block). */
      after: Stop | null;
      done: Stop[];
      total: number;
      /** "on time", "12 min behind", or null before the first arrival. */
      pace: string | null;
    };
