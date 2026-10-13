import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useBatteryPercent } from '@/features/group/battery';
import { useMyMember } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { setDemoBatteries } from '@/lib/location';
import { fetchDemoBatteries, saveDemoBattery } from '../api';
import { demoKeys } from './useDemoSession';

/** Everyone's levels are fetched again this often, in case a Realtime change was missed. */
export const DEMO_BATTERIES_REFETCH_MS = 60_000;

/**
 * Demo mode: real members show their real phone battery (only their position is pretend).
 * This phone reads its level every 20 s (useBatteryPercent) and saves it to `demo_batteries`
 * whenever the % changes (never a position); a failed save is tried again within a minute.
 * Everyone's levels go to lib/location, live with Realtime (and refetched every minute).
 * Made-up members keep fake levels.
 */
export function useDemoBatteries(tripId: string | undefined) {
  const me = useMyMember(tripId);
  const mine = useBatteryPercent();
  const query = useQuery({
    queryKey: demoKeys.batteries(tripId ?? ''),
    queryFn: () => fetchDemoBatteries(tripId!),
    enabled: !!tripId,
    refetchInterval: DEMO_BATTERIES_REFETCH_MS,
  });
  useTripRealtime(tripId, ['demo_batteries']);
  const meId = me?.id;
  const saved = useRef<{ key: string; battery: number } | null>(null);

  useEffect(() => {
    if (!tripId || !meId || mine == null) return;
    const key = `${tripId}:${meId}`;
    const save = () => {
      if (saved.current?.key === key && saved.current.battery === mine) return;
      saved.current = { key, battery: mine };
      saveDemoBattery(tripId, meId, mine).catch((e) => {
        saved.current = null;
        console.warn("Couldn't share the battery level:", e instanceof Error ? e.message : e);
      });
    };
    save();
    const id = setInterval(save, DEMO_BATTERIES_REFETCH_MS);
    return () => clearInterval(id);
  }, [tripId, meId, mine]);

  useEffect(() => {
    const levels = { ...(query.data ?? {}) };
    if (meId && mine != null) levels[meId] = mine;
    setDemoBatteries(levels);
  }, [query.data, meId, mine]);
  useEffect(() => () => setDemoBatteries({}), []);
}
