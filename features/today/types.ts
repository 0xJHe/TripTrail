import type { Stop, StopStatus } from '@/features/planning/types';
import type { NearbySuggestion, RainOption } from '@/supabase/functions/_shared/nearby';
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
  /** demo = Demo mode: the time until the replay reaches the stop. */
  travel_source: 'estimate' | 'google' | 'demo';
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

/** A stop's times (what running early changes, and Demo mode Reset puts back). */
export type StopTimes = Pick<Stop, 'id' | 'planned_time' | 'planned_end'>;

/** Row in `early_alerts`: the group's one running-early card for the stop they're heading to. */
export interface EarlyAlert {
  stop_id: string;
  trip_id: string;
  day_number: number;
  /** The stop the group had just left, and when. */
  left_stop_id: string | null;
  left_at: string | null;
  /** now() when the check found spare time (the fake time in Demo mode). */
  checked_at: string;
  spare_min: number;
  travel_min: number;
  /** The nearby place; null = nothing fits ("Enjoy the extra time"). */
  suggestion: NearbySuggestion | null;
  /** offer = "Go to next stop" was tapped: asking whether to move the next stop earlier. */
  status: 'open' | 'offer' | 'added' | 'moved' | 'kept';
  added_stop_id: string | null;
  original: StopTimes[] | null;
  changed: StopTimes[] | null;
  decided_by: string | null;
  decided_at: string | null;
}

/** What a phone saves when the group has 30+ min to spare. */
export type NewEarlyAlert = Pick<
  EarlyAlert,
  'stop_id' | 'trip_id' | 'day_number' | 'left_stop_id' | 'left_at' | 'checked_at' | 'spare_min' | 'travel_min' | 'suggestion'
>;

/** Row in `rain_alerts`: the group's one rain card for an outdoor stop. */
export interface RainAlert {
  /** The outdoor stop. */
  stop_id: string;
  trip_id: string;
  day_number: number;
  /** now() when the check found rain coming (the fake time in Demo mode). */
  checked_at: string;
  /** Minutes from checked_at until the rain. */
  rain_in_min: number;
  /** Up to 3 indoor places, nearest first; empty = "consider moving it". */
  options: RainOption[];
  status: 'open' | 'swapped' | 'kept';
  picked: RainOption | null;
  /** The stop added when the group was already at the outdoor stop. */
  added_stop_id: string | null;
  /** The outdoor stop before the swap (Demo mode's replay and Reset use it). */
  original: RainOriginal | null;
  decided_by: string | null;
  decided_at: string | null;
}

/** What a swap changed on the outdoor stop. */
export type RainOriginal = Pick<
  Stop,
  | 'name'
  | 'address'
  | 'lat'
  | 'lng'
  | 'place_id'
  | 'price'
  | 'is_estimate'
  | 'is_outdoor'
  | 'category'
  | 'tip'
  | 'note'
  | 'status'
  | 'left_at'
  | 'planned_end'
>;

/** What a phone saves when rain is coming at an outdoor stop. */
export type NewRainAlert = Pick<RainAlert, 'stop_id' | 'trip_id' | 'day_number' | 'checked_at' | 'rain_in_min' | 'options'>;
