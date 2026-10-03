import type { SceneKind } from '@/lib/ai';

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
