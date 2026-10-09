/** Row in `spends`: one person's spend-check answer for a stop, or an extra spend. Amounts are RM. */
export interface Spend {
  id: string;
  trip_id: string;
  /** The stop asked about; null = an extra spend logged with "+ Add spend". */
  stop_id: string | null;
  member_id: string;
  /** The trip day it counts on. */
  day_number: number;
  /**
   * What they paid; the guess when they tapped ✓ or skipped. For a booked stop (hotel,
   * flights) the extra on top of the booking.
   */
  amount: number;
  /** ✓ on the guess (false = they typed the amount). */
  confirmed: boolean;
  /** Skipped: the stop keeps its guess. */
  skipped: boolean;
  /** Extra spends: "Grab to hotel". */
  note: string | null;
  /** now() when answered (the fake time in Demo mode). */
  answered_at: string;
}

export type NewSpend = Omit<Spend, 'id'>;

/** How the spend check was answered. */
export type SpendAnswer = { kind: 'confirm' } | { kind: 'amount'; amount: number } | { kind: 'skip' };
