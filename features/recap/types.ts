/** Row in `day_closures`: one person tapped "Done for today" for a trip day. */
export interface DayClosure {
  trip_id: string;
  member_id: string;
  day_number: number;
  /** Always true now (Done for today is final); false only on old rows from when a day could be reopened. */
  closed: boolean;
  /** now() when closed (the fake time in Demo mode, so Reset undoes it). */
  closed_at: string;
}

/** Today tab, once the day's stops are behind them. */
export type DayEndMode =
  /** Stops still to go: nothing shown. */
  | 'hidden'
  /** "That's every stop for today" with Done for today / Keep going. */
  | 'ask'
  /** Kept going: Done for today and + Add more stops pinned to the bottom. */
  | 'keep-going'
  /** This person closed the day: "Day closed. See you tomorrow". */
  | 'closed';
