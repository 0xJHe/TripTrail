import type { Pin } from '@/features/group/types';
import type { Spend } from '@/features/money/types';

/**
 * What Reset clears besides the clock: this phone's pins and "+ Add spend" rows made during
 * the demo (at or after the fake start time, Day 1's replay start), so each demo starts clean.
 * Only this person's (only they can delete them). Spend-check answers after the fake time
 * are already ignored, and are replaced when answered again.
 */
export function demoLeftovers<P extends Pick<Pin, 'member_id' | 'created_at'>, S extends Pick<Spend, 'member_id' | 'stop_id' | 'answered_at'>>({
  pins,
  spends,
  meId,
  since,
}: {
  pins: P[];
  spends: S[];
  meId: string;
  since: number;
}): { pins: P[]; spends: S[] } {
  const during = (iso: string | null | undefined) => iso != null && Date.parse(iso) >= since;
  return {
    pins: pins.filter((p) => p.member_id === meId && during(p.created_at)),
    spends: spends.filter((s) => s.member_id === meId && s.stop_id == null && during(s.answered_at)),
  };
}
