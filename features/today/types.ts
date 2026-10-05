import type { Stop, StopStatus } from '@/features/planning/types';
import type { NewDay } from '@/supabase/functions/_shared/newDay';

/** The parts of a stop the arrive / leave rules read. */
export type VisitStop = Pick<Stop, 'id' | 'lat' | 'lng' | 'status' | 'arrived_at' | 'left_at'> &
  Partial<Pick<Stop, 'planned_time'>>;

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

/** Row in `late_alerts`: the group's one running-late card for a stop. */
export interface LateAlert {
  stop_id: string;
  trip_id: string;
  day_number: number;
  /** now() when the check found them late (the fake time in Demo mode). */
  checked_at: string;
  travel_min: number;
  travel_source: 'estimate' | 'google';
  starts_at: string | null;
  /** The suggested new day (simple rules). */
  plan: NewDay;
  status: 'open' | 'accepted' | 'kept';
  /** The stops' times before accepting (Demo mode builds its route from these). */
  original: Pick<Stop, 'id' | 'planned_time' | 'planned_end' | 'status'>[] | null;
  decided_by: string | null;
  decided_at: string | null;
}

/** What a phone saves when it finds the group will be late. */
export type NewLateAlert = Pick<
  LateAlert,
  'stop_id' | 'trip_id' | 'day_number' | 'checked_at' | 'travel_min' | 'travel_source' | 'starts_at' | 'plan'
>;
