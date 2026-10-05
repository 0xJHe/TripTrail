import { haversineMeters, type LatLng } from '@/lib/distance';
import type { VisitChange, VisitStop } from './types';

/**
 * Arrive / leave rules (CLAUDE.md "Key logic"):
 * - Arrived: within 100 m of a stop for 2 readings in a row -> status "arrived", arrived_at = now.
 * - Left: more than 150 m from the arrived stop for 3 minutes -> status "done", left_at = now.
 * - Two stops within 150 m of each other: arriving at one only counts from 15 min before its
 *   planned start, so being near it early doesn't skip the stop the group is at.
 * Pure functions; the tracker hook feeds them readings and saves the changes.
 */

export const ARRIVE_M = 100;
export const ARRIVE_READINGS = 2;
export const LEAVE_M = 150;
export const LEAVE_AFTER_MS = 3 * 60_000;
export const NEAR_STOPS_M = 150;
export const EARLY_ARRIVE_MS = 15 * 60_000;

export interface Reading extends LatLng {
  /** Time of the reading (ms). */
  at: number;
}

export interface TrackerState {
  /** Planned stop we were within 100 m of, and how many readings in a row. */
  near: { stopId: string; count: number } | null;
  /** First reading more than 150 m from the arrived stop (reset when back in range). */
  awaySince: number | null;
  /** Time of the last reading handled. */
  lastAt: number | null;
}

export const emptyTracker = (): TrackerState => ({ near: null, awaySince: null, lastAt: null });

const hasPlace = (s: VisitStop): s is VisitStop & LatLng => s.lat != null && s.lng != null;

/** A stop with another one within 150 m that doesn't start for more than 15 min yet: not arrived. */
function tooEarly(s: VisitStop & LatLng, stops: VisitStop[], at: number): boolean {
  if (!s.planned_time || at >= Date.parse(s.planned_time) - EARLY_ARRIVE_MS) return false;
  return stops.some((o) => o.id !== s.id && o.status !== 'dropped' && hasPlace(o) && haversineMeters(o, s) <= NEAR_STOPS_M);
}

/** The stop the group is at: the one marked arrived (latest, if more than one). */
export function currentStop<T extends VisitStop>(stops: T[]): T | null {
  return stops
    .filter((s) => s.status === 'arrived')
    .reduce<T | null>((best, s) => (!best || (s.arrived_at ?? '') > (best.arrived_at ?? '') ? s : best), null);
}

/** Apply changes to a list of stops (same shape back). */
export function applyChanges<T extends VisitStop>(stops: T[], changes: VisitChange[]): T[] {
  if (changes.length === 0) return stops;
  const byId = new Map(changes.map((c) => [c.stopId, c]));
  return stops.map((s) => {
    const c = byId.get(s.id);
    return c ? { ...s, status: c.status, arrived_at: c.arrived_at, left_at: c.left_at } : s;
  });
}

const iso = (ms: number) => new Date(ms).toISOString();

function leftChange(s: VisitStop, at: number): VisitChange {
  return { stopId: s.id, from: s.status, status: 'done', arrived_at: s.arrived_at, left_at: iso(at) };
}

/** Handle one location reading. `stops` = today's stops with their current status. */
export function processReading(
  state: TrackerState,
  stops: VisitStop[],
  r: Reading,
): { state: TrackerState; changes: VisitChange[] } {
  const changes: VisitChange[] = [];
  let { near, awaySince } = state;
  let current = currentStop(stops);

  // Left: more than 150 m away for 3 minutes.
  if (current && hasPlace(current)) {
    if (haversineMeters(r, current) > LEAVE_M) {
      awaySince = awaySince ?? r.at;
      if (r.at - awaySince >= LEAVE_AFTER_MS) {
        changes.push(leftChange(current, r.at));
        current = null;
        awaySince = null;
      }
    } else {
      awaySince = null;
    }
  } else {
    awaySince = null;
  }

  // Arrived: the nearest planned stop within 100 m, for 2 readings in a row.
  const candidate = stops
    .filter((s): s is VisitStop & LatLng => s.status === 'planned' && hasPlace(s))
    .filter((s) => !tooEarly(s, stops, r.at))
    .map((s) => ({ s, d: haversineMeters(r, s) }))
    .filter((x) => x.d <= ARRIVE_M)
    .sort((a, b) => a.d - b.d)[0]?.s;

  if (!candidate) {
    near = null;
  } else {
    const count = near?.stopId === candidate.id ? near.count + 1 : 1;
    if (count >= ARRIVE_READINGS) {
      // Reached the next stop without the last one timing out (they were close together): close it now.
      if (current) changes.push(leftChange(current, r.at));
      changes.push({ stopId: candidate.id, from: 'planned', status: 'arrived', arrived_at: iso(r.at), left_at: null });
      near = null;
      awaySince = null;
    } else {
      near = { stopId: candidate.id, count };
    }
  }

  return { state: { near, awaySince, lastAt: r.at }, changes };
}

/**
 * Handle readings in time order. Returns one change per stop (merged, e.g. planned -> done
 * when a whole visit happens inside the batch), with `from` = the status before the batch.
 */
export function processReadings(
  state: TrackerState,
  stops: VisitStop[],
  readings: Reading[],
): { state: TrackerState; changes: VisitChange[] } {
  const merged = new Map<string, VisitChange>();
  let s = state;
  let list = stops;
  for (const r of readings) {
    const out = processReading(s, list, r);
    s = out.state;
    if (out.changes.length === 0) continue;
    list = applyChanges(list, out.changes);
    for (const c of out.changes) {
      const before = merged.get(c.stopId);
      merged.set(c.stopId, before ? { ...c, from: before.from } : c);
    }
  }
  return { state: s, changes: [...merged.values()] };
}

/**
 * Demo mode only, when the fake clock goes back (Reset): undo visits that are now in the future.
 * Arrived after t -> planned again; left after t -> arrived again.
 */
export function undoFutureVisits(stops: VisitStop[], t: number): VisitChange[] {
  const changes: VisitChange[] = [];
  for (const s of stops) {
    if (s.arrived_at && Date.parse(s.arrived_at) > t) {
      changes.push({ stopId: s.id, from: s.status, status: 'planned', arrived_at: null, left_at: null });
    } else if (s.left_at && Date.parse(s.left_at) > t) {
      changes.push({ stopId: s.id, from: s.status, status: 'arrived', arrived_at: s.arrived_at, left_at: null });
    }
  }
  return changes;
}

/** Readings every `stepMs` from just after `from` up to and including `to` (to fill a jump of the demo clock). */
export function readingTimes(from: number, to: number, stepMs: number, max = 2000): number[] {
  const times: number[] = [];
  const first = Math.max(from + stepMs, to - (max - 1) * stepMs);
  for (let t = first; t < to; t += stepMs) times.push(t);
  times.push(to);
  return times;
}
