import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { planningKeys, useStops } from '@/features/planning/hooks/usePlanning';
import { dayCount, planStart, sortStops } from '@/features/planning/stops';
import { useTrip } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { useCurrentTrip } from '@/features/trip/store';
import { now, useNow } from '@/lib/clock';
import { getGroupLocation, useDemoRoute } from '@/lib/location';
import { estimateMinutes } from '@/supabase/functions/_shared/eta';
import type { NearbySuggestion } from '@/supabase/functions/_shared/nearby';
import { fetchEarlyAlerts, fetchNearby, raiseEarlyAlert, undoDemoMoments } from '../api';
import { earlyAlertFor, earlyCheck, justLeft } from '../early';
import { checkable } from '../late';
import { useLocationAccess } from '../permission';
import { todayView } from '../todayPlan';
import { lateKeys, useLateAlerts } from './useLateCheck';
import { rainKeys } from './useRainCheck';

export const earlyKeys = {
  alerts: (tripId: string) => ['earlyAlerts', tripId] as const,
};

/** The trip's running-early cards (kept live by Realtime in useEarlyCheck). */
export function useEarlyAlerts(tripId: string | undefined) {
  return useQuery({
    queryKey: earlyKeys.alerts(tripId ?? ''),
    queryFn: () => fetchEarlyAlerts(tripId!),
    enabled: !!tripId,
  });
}

/**
 * When the group leaves a stop (or taps "We're done here") 15+ min before its planned end,
 * checks whether there are 30+ minutes to spare before the next one and saves the
 * running-early card for everyone, with one nearby suggestion (nearby-suggestion function). Mounted once in the tabs layout.
 * Free straight-line estimate only (no Google for the travel time). Time from lib/clock and
 * position from lib/location, so Demo mode drives it too.
 */
export function useEarlyCheck() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const trip = useTrip(tripId);
  const stops = useStops(tripId);
  const lateAlerts = useLateAlerts(tripId);
  const earlyAlerts = useEarlyAlerts(tripId);
  useTripRealtime(tripId, ['early_alerts']);
  const demo = useDemoRoute((s) => s.route) != null;
  const permission = useLocationAccess((s) => s.permission);
  const time = useNow().getTime();
  const queryClient = useQueryClient();
  /** Left stop id -> time of the check (one check per leave). */
  const done = useRef(new Map<string, number>());
  const busy = useRef(false);
  /** Something changed while a check was running: look again when it's done. */
  const again = useRef(false);
  const lastTime = useRef<number | null>(null);
  const [round, setRound] = useState(0);

  // New trip, or switching between demo and real: start over.
  useEffect(() => {
    done.current.clear();
    lastTime.current = null;
  }, [tripId, demo]);

  // Demo mode, the fake clock went back (Reset): forget the checks after it, and the rain,
  // running-early and running-late cards checked after it (putting back the stops they
  // changed). All kinds are undone here, latest kind first, so the oldest times win.
  useEffect(() => {
    const last = lastTime.current;
    lastTime.current = time;
    if (!demo || !tripId || last == null || time >= last) return;
    for (const [key, at] of done.current) if (at > time) done.current.delete(key);
    undoDemoMoments(tripId, new Date(time))
      .catch((e) => console.warn('Undoing rain / running-early / late cards failed:', e instanceof Error ? e.message : e))
      .finally(() => {
        queryClient.invalidateQueries({ queryKey: rainKeys.alerts(tripId) });
        queryClient.invalidateQueries({ queryKey: earlyKeys.alerts(tripId) });
        queryClient.invalidateQueries({ queryKey: lateKeys.alerts(tripId) });
        queryClient.invalidateQueries({ queryKey: planningKeys.stops(tripId) });
      });
  }, [demo, tripId, time, queryClient]);

  useEffect(() => {
    if (busy.current) {
      again.current = true;
      return;
    }
    const t = trip.data;
    if (!tripId || !t || t.stage !== 'decided' || !stops.data || !lateAlerts.data || !earlyAlerts.data) return;
    if (!demo && permission !== 'granted') return;
    const sorted = sortStops(stops.data);
    const view = todayView({
      stage: t.stage,
      start: planStart(t.start_date, sorted),
      days: dayCount(sorted, t.length_days),
      stops: sorted,
      now: new Date(time),
    });
    // Between stops only: once they're at the next one, there's nothing to fill.
    if (view.kind !== 'day' || view.now || !checkable(view.next)) return;
    const next = view.next;
    const left = justLeft(
      sorted.filter((s) => s.day_number === view.day),
      time,
    );
    if (!left || done.current.has(left.id)) return;
    if (lateAlerts.data.some((a) => a.stop_id === next.id) || earlyAlerts.data.some((a) => a.stop_id === next.id)) {
      done.current.set(left.id, time);
      return;
    }

    busy.current = true;
    const check = async () => {
      const at = now().getTime();
      const loc = await getGroupLocation();
      if (!loc) return; // no position yet: try again on the next tick
      done.current.set(left.id, at);
      const travelMin = estimateMinutes(loc.center, next);
      const early = earlyCheck({ left, next, now: at, travelMin, lateAlerts: lateAlerts.data, earlyAlerts: earlyAlerts.data });
      if (!early) return;
      const { spareMin } = early;
      const clock = new Date(at);
      let suggestion: NearbySuggestion | null = null;
      try {
        const reply = await fetchNearby(tripId, {
          stopId: next.id,
          from: loc.center,
          spareMin,
          localMinutes: clock.getHours() * 60 + clock.getMinutes(),
        });
        suggestion = reply.suggestion;
      } catch (e) {
        console.warn('nearby-suggestion failed, showing the card without one:', e instanceof Error ? e.message : e);
      }
      await raiseEarlyAlert(earlyAlertFor({ tripId, left, next, now: at, travelMin, spareMin, suggestion }));
      queryClient.invalidateQueries({ queryKey: earlyKeys.alerts(tripId) });
    };
    check()
      .catch((e) => console.warn('Running-early check failed:', e instanceof Error ? e.message : e))
      .finally(() => {
        busy.current = false;
        if (again.current) {
          again.current = false;
          setRound((r) => r + 1);
        }
      });
  }, [tripId, trip.data, stops.data, lateAlerts.data, earlyAlerts.data, time, demo, permission, queryClient, round]);
}
