import { useQuery } from '@tanstack/react-query';
import * as Battery from 'expo-battery';
import { useEffect } from 'react';

import { useMyMember } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { setDemoBatteries } from '@/lib/location';
import { fetchDemoBatteries, saveDemoBattery } from '../api';
import { demoKeys } from './useDemoSession';

/**
 * Demo mode: real members show their real phone battery (only their position is pretend).
 * Saves this phone's level to `demo_batteries` whenever it changes (never a position) and
 * hands everyone's to lib/location, live with Realtime. Made-up members keep fake levels.
 */
export function useDemoBatteries(tripId: string | undefined) {
  const me = useMyMember(tripId);
  const level = Battery.useBatteryLevel();
  const mine = level >= 0 ? Math.round(level * 100) : null;
  const query = useQuery({
    queryKey: demoKeys.batteries(tripId ?? ''),
    queryFn: () => fetchDemoBatteries(tripId!),
    enabled: !!tripId,
  });
  useTripRealtime(tripId, ['demo_batteries']);
  const meId = me?.id;

  useEffect(() => {
    if (!tripId || !meId || mine == null) return;
    saveDemoBattery(tripId, meId, mine).catch((e) =>
      console.warn("Couldn't share the battery level:", e instanceof Error ? e.message : e),
    );
  }, [tripId, meId, mine]);

  useEffect(() => {
    const levels = { ...(query.data ?? {}) };
    if (meId && mine != null) levels[meId] = mine;
    setDemoBatteries(levels);
  }, [query.data, meId, mine]);
  useEffect(() => () => setDemoBatteries({}), []);
}
