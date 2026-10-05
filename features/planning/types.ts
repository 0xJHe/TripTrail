import type { OptionPhoto, SceneKind, StopCategory } from '@/lib/ai';

/** Row in `preferences` (one per member). */
export interface Preferences {
  member_id: string;
  trip_id: string;
  daily_budget: number | null;
  free_dates: string[];
  food_needs: string[];
  must_haves: string[];
  no_go: string | null;
  updated_at: string;
}

/** Extra details kept in trip_options.plan_json. */
export interface OptionPlan {
  days: number;
  scene: SceneKind;
  /** Must-haves this trip covers. */
  covers: string[];
  /** Things this trip involves that someone may have as a no-go. */
  avoids: string[];
  halal: boolean;
  dayTitles: string[];
  /** Landmark the card photo shows, e.g. "Kek Lok Si Temple, Penang". */
  landmark?: string | null;
  /** Google place ID of the landmark, used to refresh an expired photo link. */
  placeId?: string | null;
  /** One Google photo with its credit; null/missing = the drawing. */
  photo?: OptionPhoto | null;
  /** The photo was skipped because Google's daily limit was reached. */
  photoLimited?: boolean;
  /** Why the options can't fit everyone (same on every option of the trip). */
  fitNote?: string | null;
}

/** Row in `trip_options`. */
export interface TripOption {
  id: string;
  trip_id: string;
  name: string;
  cost_per_person: number;
  start_date: string | null;
  end_date: string | null;
  tags: string[];
  summary: string | null;
  fits_everyone: boolean;
  plan_json: OptionPlan;
  position: number;
}

/** Row in `votes`. */
export interface Vote {
  member_id: string;
  option_id: string;
  trip_id: string;
  liked: boolean;
}

export type StopStatus = 'planned' | 'arrived' | 'done' | 'dropped';

/** Row in `stops`. Times are ISO timestamps; prices are per person, RM. */
export interface Stop {
  id: string;
  trip_id: string;
  day_number: number;
  position: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  planned_time: string | null;
  planned_end: string | null;
  price: number;
  is_estimate: boolean;
  is_booked: boolean;
  is_outdoor: boolean;
  tip: string | null;
  status: StopStatus;
  arrived_at: string | null;
  left_at: string | null;
  actual_cost: number | null;
  category: StopCategory | null;
  priority: number;
  note: string | null;
  /** Google place ID, when the stop was found in Google Places. */
  place_id: string | null;
}

/** A stop before it is saved (no id yet). */
export type NewStop = Pick<
  Stop,
  | 'day_number'
  | 'position'
  | 'name'
  | 'lat'
  | 'lng'
  | 'planned_time'
  | 'planned_end'
  | 'price'
  | 'is_estimate'
  | 'is_booked'
  | 'is_outdoor'
  | 'tip'
  | 'category'
  | 'address'
  | 'place_id'
>;
