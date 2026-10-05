import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useStops } from '@/features/planning/hooks/usePlanning';
import { planStart, sortStops } from '@/features/planning/stops';
import { useTrip } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { useCurrentTrip } from '@/features/trip/store';
import { now, useNow } from '@/lib/clock';
import { getGroupLocation, sampleRoute, useDemoRoute, type GroupLocation } from '@/lib/location';
import {
  applyChanges,
  emptyTracker,
  processReadings,
  readingTimes,
  undoFutureVisits,
  type Reading,
} from '../arrival';
import { useLocationAccess, useWatchLocationPermission } from '../permission';
import { tripDayOn } from '../todayPlan';
import { useSaveVisits } from './useSaveVisits';

/** How often to read the location while the app is open (and the step used to replay demo jumps). */
export const READ_EVERY_MS = 30_000;
/** Demo mode: how often (real time) to re-read the paused fake position. */
const DEMO_READ_EVERY_MS = 4_000;

/** This phone's position from a reading (the group centre if this phone isn't in it). */
const toReading = (loc: GroupLocation, at: number): Reading => ({ ...(loc.me ?? loc.center), at });

/**
 * Ticks stops off as the group arrives and leaves, for the open trip's day. Mounted once
 * in the tabs layout so it runs whichever tab is showing.
 * Real mode: reads GPS every 30 s while the app is in front. Demo mode: replays the
 * fake route in 30 s steps up to the fake time, so a "Next event" jump gets the same
 * readings a real phone would have had.
 */
export function useVisitTracker() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const trip = useTrip(tripId);
  const stops = useStops(tripId);
  useTripRealtime(tripId, ['stops']);
  useWatchLocationPermission();
  const permission = useLocationAccess((s) => s.permission);
  const route = useDemoRoute((s) => s.route);
  const time = useNow().getTime();
  const save = useSaveVisits(tripId);

  const decided = trip.data?.stage === 'decided';
  const start = planStart(trip.data?.start_date ?? null, sortStops(stops.data ?? []));
  const demo = route != null;
  const tracker = useRef(emptyTracker());
  const stopsRef = useRef(stops.data);
  stopsRef.current = stops.data;

  // New trip, or switching between demo and real: start over.
  useEffect(() => {
    tracker.current = emptyTracker();
    useLocationAccess.getState().refresh();
  }, [tripId, demo]);

  /** Run readings against the day's stops (the day of the newest reading); save what changed. */
  const handle = useCallback(
    (readings: Reading[], undo = false) => {
      if (readings.length === 0) return;
      const t = readings[readings.length - 1].at;
      const all = stopsRef.current ?? [];
      const undone = undo ? undoFutureVisits(all, t) : [];
      const day = tripDayOn(start, new Date(t));
      const today = sortStops(applyChanges(all, undone)).filter((s) => s.day_number === day);
      const out = processReadings(tracker.current, today, readings);
      tracker.current = out.state;
      // An undo and a new visit for the same stop: the later one wins, but keep the undo's starting status.
      const merged = new Map(undone.map((c) => [c.stopId, c]));
      for (const c of out.changes) merged.set(c.stopId, { ...c, from: merged.get(c.stopId)?.from ?? c.from });
      save([...merged.values()]);
    },
    [start, save],
  );

  // Demo: replay the route up to the fake time. Going back (Reset) undoes visits after it.
  useEffect(() => {
    if (!route || !tripId || route.tripId !== tripId || !decided || !stops.data) return;
    const last = tracker.current.lastAt;
    if (last === time) return;
    const back = last == null || time < last;
    if (back) tracker.current = emptyTracker();
    const from = back ? Math.min(route.startsAt, time) - READ_EVERY_MS : last;
    const readings = readingTimes(from, time, READ_EVERY_MS).map((at) => toReading(sampleRoute(route, at), at));
    handle(readings, back);
  }, [route, tripId, decided, stops.data, time, handle]);

  // Keep reading while the app is open: GPS every 30 s. In Demo mode the fake clock stands
  // still between taps, so this is the group standing still: a second reading in a row at a
  // stop confirms the arrival a few seconds after "Next event", like a real phone would.
  useEffect(() => {
    if (!tripId || !decided || (!demo && permission !== 'granted')) return;
    let active = AppState.currentState === 'active';
    let busy = false;
    const tick = async () => {
      if (!active || busy || !stopsRef.current) return;
      busy = true;
      try {
        const loc = await getGroupLocation();
        const t = now().getTime();
        const last = tracker.current.lastAt;
        // Demo: a clock jump is replayed by the effect above, only repeat the current time here.
        if (loc && (demo ? last === t : last == null || t >= last)) handle([toReading(loc, t)]);
      } finally {
        busy = false;
      }
    };
    if (!demo) tick();
    const id = setInterval(tick, demo ? DEMO_READ_EVERY_MS : READ_EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => {
      active = s === 'active';
      if (active) tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [demo, tripId, decided, permission, handle]);
}
