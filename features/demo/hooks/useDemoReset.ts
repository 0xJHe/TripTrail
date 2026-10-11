import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { deletePin, fetchPins } from '@/features/group/api';
import { pinKeys } from '@/features/group/hooks/usePinSpot';
import { deleteSpend, fetchSpends } from '@/features/money/api';
import { spendKeys } from '@/features/money/hooks/useSpends';
import { useMyMember } from '@/features/trip/hooks/useTrip';
import { now, resetFakeTime } from '@/lib/clock';
import { demoLeftovers } from '../reset';

/**
 * The debug bar's Reset: removes this phone's pins and extra spends made during the demo
 * (from `since`, the fake start time), then starts the replay again from the top of Day 1.
 * The clock goes back even if the clean-up fails.
 */
export function useDemoReset(tripId: string | undefined, since: number | null) {
  const queryClient = useQueryClient();
  const me = useMyMember(tripId);
  const [resetting, setResetting] = useState(false);

  const reset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      if (tripId && me && since != null) {
        const [pins, spends] = await Promise.all([fetchPins(tripId), fetchSpends(tripId)]);
        const gone = demoLeftovers({ pins, spends, meId: me.id, since });
        const at = now().toISOString();
        await Promise.all([...gone.pins.map((p) => deletePin(p, at)), ...gone.spends.map((s) => deleteSpend(s.id))]);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: pinKeys.pins(tripId) }),
          queryClient.invalidateQueries({ queryKey: spendKeys.spends(tripId) }),
        ]);
      }
    } catch (e) {
      console.warn("Demo reset couldn't remove the demo's pins / spends:", e instanceof Error ? e.message : e);
    } finally {
      resetFakeTime();
      setResetting(false);
    }
  };

  return { reset, resetting };
}
