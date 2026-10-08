import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { useStops } from '@/features/planning/hooks/usePlanning';
import { dayCount, planStart, sortStops } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { demoTravelMin } from '@/features/demo/route';
import { useTrip } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { useCurrentTrip } from '@/features/trip/store';
import { now, useNow } from '@/lib/clock';
import { getGroupLocation, useDemoRoute, type DemoRoute } from '@/lib/location';
import { estimateMinutes, worthAskingGoogle, type CheckKind } from '@/supabase/functions/_shared/eta';
import { fetchEta, fetchLateAlerts, raiseLateAlert } from '../api';
import { checkable, dueChecks, lastLeftAt, lateAlertFor } from '../late';
import type { LateAlert } from '../types';
import { useLocationAccess } from '../permission';
import { todayView } from '../todayPlan';

export const lateKeys = {
  alerts: (tripId: string) => ['lateAlerts', tripId] as const,
};

/** The trip's running-late cards (kept live by Realtime in useLateCheck). */
export function useLateAlerts(tripId: string | undefined) {
  return useQuery({
    queryKey: lateKeys.alerts(tripId ?? ''),
    queryFn: () => fetchLateAlerts(tripId!),
    enabled: !!tripId,
  });
}

const KINDS: CheckKind[] = ['before', 'left'];

/**
 * Checks whether the group will be late for the next stop and saves the running-late
 * card for everyone. Mounted once in the tabs layout so it runs whichever tab is showing.
 * Free straight-line estimate first; Google (eta function) only when that is close.
 * Time from lib/clock and position from lib/location, so Demo mode drives it too.
 */
export function useLateCheck() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const trip = useTrip(tripId);
  const stops = useStops(tripId);
  const alerts = useLateAlerts(tripId);
  useTripRealtime(tripId, ['late_alerts']);
  const route = useDemoRoute((s) => s.route);
  const demo = route != null;
  const permission = useLocationAccess((s) => s.permission);
  const time = useNow().getTime();
  const queryClient = useQueryClient();
  /** `${stopId}:${kind}` -> time of the check (at most one of each kind per stop). */
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

  // Demo mode, the fake clock went back (Reset): forget the checks after it. The cards
  // themselves are removed with the running-early ones (useEarlyCheck), early first.
  useEffect(() => {
    const last = lastTime.current;
    lastTime.current = time;
    if (!demo || last == null || time >= last) return;
    for (const [key, at] of done.current) if (at > time) done.current.delete(key);
  }, [demo, time]);

  useEffect(() => {
    if (busy.current) {
      again.current = true;
      return;
    }
    const t = trip.data;
    if (!tripId || !t || t.stage !== 'decided' || !stops.data || !alerts.data) return;
    if (!demo && permission !== 'granted') return;
    const sorted = sortStops(stops.data);
    const view = todayView({
      stage: t.stage,
      start: planStart(t.start_date, sorted),
      days: dayCount(sorted, t.length_days),
      stops: sorted,
      now: new Date(time),
    });
    if (view.kind !== 'day' || !checkable(view.next)) return;
    const next = view.next;
    if (alerts.data.some((a) => a.stop_id === next.id)) return; // one card per stop
    const dayStops = sorted.filter((s) => s.day_number === view.day);
    const kinds = dueChecks({
      startsAt: Date.parse(next.planned_time),
      lastLeft: lastLeftAt(dayStops, time),
      now: time,
      done: new Set(KINDS.filter((k) => done.current.has(`${next.id}:${k}`))),
    });
    if (kinds.length === 0) return;

    busy.current = true;
    const check = async () => {
      const at = now().getTime();
      const loc = await getGroupLocation();
      if (!loc) return; // no position yet: try again on the next tick
      const travel = await travelMinutes(tripId, next, kinds[0], loc.center, at, route);
      // Both due at once (e.g. the app was closed): one check covers both.
      for (const k of kinds) done.current.set(`${next.id}:${k}`, at);
      const alert = lateAlertFor({ tripId, next, dayStops, now: at, ...travel });
      if (!alert) return;
      await raiseLateAlert(alert);
      queryClient.invalidateQueries({ queryKey: lateKeys.alerts(tripId) });
    };
    check()
      .catch((e) => console.warn('Running-late check failed:', e instanceof Error ? e.message : e))
      .finally(() => {
        busy.current = false;
        if (again.current) {
          again.current = false;
          setRound((r) => r + 1);
        }
      });
  }, [tripId, trip.data, stops.data, alerts.data, time, demo, route, permission, queryClient, round]);
}

/**
 * Free estimate; Google's real time instead when the estimate is close to (or past) the start.
 * Demo mode: the replay's own time to get there (it knows when the group arrives), no Google.
 */
async function travelMinutes(
  tripId: string,
  next: Stop & { planned_time: string; lat: number; lng: number },
  kind: CheckKind,
  from: { lat: number; lng: number },
  at: number,
  route: DemoRoute | null,
): Promise<{ travelMin: number; source: LateAlert['travel_source'] }> {
  const estimate = estimateMinutes(from, next);
  const demo = route ? demoTravelMin(route, next.id, at) : null;
  if (demo != null) return { travelMin: Math.max(estimate, demo), source: 'demo' };
  if (!worthAskingGoogle(at, estimate, Date.parse(next.planned_time))) return { travelMin: estimate, source: 'estimate' };
  try {
    const eta = await fetchEta(tripId, next.id, kind, from);
    if (eta.minutes != null) return { travelMin: eta.minutes, source: 'google' };
  } catch (e) {
    console.warn('eta failed, using the estimate:', e instanceof Error ? e.message : e);
  }
  return { travelMin: estimate, source: 'estimate' };
}
