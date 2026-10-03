/** Where the group is in planning. */
export type TripStage = 'preferences' | 'voting' | 'decided';

/** Row in `trips`. Dates are 'YYYY-MM-DD', month is 'YYYY-MM'. */
export interface Trip {
  id: string;
  name: string;
  destination: string | null;
  month: string | null;
  length_min: number | null;
  length_days: number | null;
  dates_fixed: boolean;
  start_date: string | null;
  end_date: string | null;
  join_code: string;
  created_by: string;
  winning_option_id: string | null;
  stage: TripStage;
  created_at: string;
}

/** Row in `members`. */
export interface Member {
  id: string;
  trip_id: string;
  user_id: string;
  display_name: string;
  avatar_color: string | null;
  joined_at: string;
}

/** What the create-trip form saves. */
export interface TripFields {
  name: string;
  destination: string | null;
  month: string;
  length_min: number;
  length_days: number;
  dates_fixed: boolean;
  start_date: string | null;
  end_date: string | null;
}
