import { useMemo } from 'react';

import { useStops } from '@/features/planning/hooks/usePlanning';
import { beforeEarlyChanges, withEarlyChanges } from '@/features/today/early';
import { useEarlyAlerts } from '@/features/today/hooks/useEarlyCheck';
import { useLateAlerts } from '@/features/today/hooks/useLateCheck';
import { useRainAlerts } from '@/features/today/hooks/useRainCheck';
import { beforeNewDays } from '@/features/today/late';
import { beforeRainSwaps } from '@/features/today/rain';

/**
 * The stops a demo route is built from: `data` = the plan as replayed (running-late new days
 * left out, running-early changes in), `base` = the plan before any running-early change or
 * rain swap, where the day's moments are picked from. Undefined trip = nothing loaded.
 */
export function useDemoStops(tripId: string | undefined) {
  const stopsQuery = useStops(tripId);
  const alerts = useLateAlerts(tripId);
  const earlyAlerts = useEarlyAlerts(tripId);
  const rainAlerts = useRainAlerts(tripId);
  return useMemo(() => {
    const all = stopsQuery.data;
    const late = alerts.data ?? [];
    const early = earlyAlerts.data ?? [];
    const rain = rainAlerts.data ?? [];
    return {
      data: all ? withEarlyChanges(beforeNewDays(all, late), early) : undefined,
      base: all ? beforeNewDays(beforeEarlyChanges(beforeRainSwaps(all, rain), early), late) : undefined,
      isLoading: stopsQuery.isLoading,
    };
  }, [stopsQuery.data, stopsQuery.isLoading, alerts.data, earlyAlerts.data, rainAlerts.data]);
}
