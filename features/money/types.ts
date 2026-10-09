/** Row in `spends`: one person's answer to the spend check for a stop. Amounts are RM. */
export interface Spend {
  id: string;
  trip_id: string;
  stop_id: string;
  member_id: string;
  /** What they paid; the stop's estimate when they tapped ✓ or skipped. */
  amount: number;
  /** ✓ on the estimate (false = they typed the amount). */
  confirmed: boolean;
  /** Skipped: the stop keeps its estimate. */
  skipped: boolean;
  /** now() when answered (the fake time in Demo mode). */
  answered_at: string;
}

export type NewSpend = Omit<Spend, 'id'>;

/** How the spend check was answered. */
export type SpendAnswer = { kind: 'confirm' } | { kind: 'amount'; amount: number } | { kind: 'skip' };
