import { todayISO } from '@/features/planning/dates';
import { clockOf, durationText } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { haversineMeters, type LatLng } from '@/lib/distance';
import { pinTitle } from './pins';
import type { GatherKind, MeetPointRow, Pin } from './types';

/**
 * Set meet point and Split & rejoin (prototype screens 11, 12): free straight-line ETAs,
 * the rejoin choice and "everyone's here". Simple rules only: no Google, no AI.
 */

const MIN = 60_000;
/** Walking speed for the free estimate. */
export const WALK_KMH = 5;
/** Further than this, the estimate is a ride at 25 km/h instead. */
export const WALK_UP_TO_M = 2000;
export const RIDE_KMH = 25;
/** Within this of the meet point / rejoin point counts as there. */
export const HERE_M = 50;
/** "Everyone's here" / "Back together" stays up this long (by now()). */
export const TOGETHER_SHOWN_MS = 10 * MIN;
/** A tapped spot this close to a stop or pin takes its name. */
const NAME_NEAR_M = 60;
/** A rejoin time that isn't a stop's start is rounded up to this. */
const ROUND_MIN = 5;

export interface Eta {
  /** Whole minutes, rounded up; 0 = already there. */
  minutes: number;
  mode: 'walk' | 'ride';
  meters: number;
}

/** Free straight-line estimate: 5 km/h on foot, or 25 km/h for anything over 2 km. */
export function etaTo(from: LatLng, to: LatLng): Eta {
  const meters = haversineMeters(from, to);
  const ride = meters > WALK_UP_TO_M;
  const perMin = ((ride ? RIDE_KMH : WALK_KMH) * 1000) / 60;
  return { meters, mode: ride ? 'ride' : 'walk', minutes: meters <= HERE_M ? 0 : Math.max(1, Math.ceil(meters / perMin)) };
}

/** "here", "~6 min walk", "~1 h 5 min ride". */
export function etaText(e: Eta): string {
  return e.minutes === 0 ? 'here' : `~${durationText(e.minutes)} ${e.mode}`;
}

/** Everyone on the map is within 50 m of the point (needs at least one position). */
export function everyoneHere(members: LatLng[], point: LatLng): boolean {
  return members.length > 0 && members.every((m) => haversineMeters(m, point) <= HERE_M);
}

/**
 * Both groups are at the rejoin point: everyone on the map within 50 m, with at least one
 * person from each group on the map (so one group arriving alone never ends the split).
 */
export function bothGroupsHere(members: (LatLng & { id: string })[], point: LatLng, groupB: string[]): boolean {
  const b = members.filter((m) => groupB.includes(m.id));
  return b.length > 0 && b.length < members.length && everyoneHere(members, point);
}

type RejoinStop = Pick<Stop, 'id' | 'name' | 'status' | 'lat' | 'lng' | 'planned_time'>;

export interface Rejoin<S extends RejoinStop = RejoinStop> {
  stop: S & LatLng;
  /** Rejoin time (ms). */
  at: number;
  /** Group B's estimate to get there (the slowest of them), minutes. */
  etaMin: number;
  mode: 'walk' | 'ride';
  /** true = group B makes the stop's planned start; false = rejoin when they get there. */
  inTime: boolean;
}

/**
 * Where and when the split ends: the next stop on today's plan (still to come, in order)
 * that group B can reach by its planned start with the free estimate. If none, the next
 * stop, at group B's estimated arrival (rounded up to 5 min). null = no stop left today.
 * `dayStops` sorted by time; `groupB` = their positions (none known: assumed there in time).
 */
export function pickRejoin<S extends RejoinStop>(dayStops: S[], groupB: LatLng[], t: number): Rejoin<S> | null {
  const ahead = dayStops.filter((s): s is S & LatLng => s.status === 'planned' && s.lat != null && s.lng != null);
  if (ahead.length === 0) return null;
  const etaOf = (s: LatLng) => {
    const etas = groupB.map((p) => etaTo(p, s));
    const slowest = etas.reduce<Eta | null>((a, e) => (!a || e.minutes > a.minutes ? e : a), null);
    return slowest ?? { minutes: 0, mode: 'walk' as const, meters: 0 };
  };
  for (const stop of ahead) {
    const start = stop.planned_time ? Date.parse(stop.planned_time) : NaN;
    const eta = etaOf(stop);
    if (!Number.isNaN(start) && start > t && t + eta.minutes * MIN <= start) {
      return { stop, at: start, etaMin: eta.minutes, mode: eta.mode, inTime: true };
    }
  }
  const stop = ahead[0];
  const eta = etaOf(stop);
  const step = ROUND_MIN * MIN;
  return { stop, at: Math.ceil((t + eta.minutes * MIN) / step) * step, etaMin: eta.minutes, mode: eta.mode, inTime: false };
}

/** Group A's mini-plan: the stop they are at and the stops still to come before the rejoin stop. */
export function groupAPlan<S extends Pick<Stop, 'id' | 'status'>>(dayStops: S[], rejoinStopId: string): S[] {
  const end = dayStops.findIndex((s) => s.id === rejoinStopId);
  return dayStops.slice(0, end < 0 ? dayStops.length : end).filter((s) => s.status === 'arrived' || s.status === 'planned');
}

export interface Gathering {
  row: MeetPointRow;
  /** active = still going; together = everyone got there a moment ago. */
  state: 'active' | 'together';
}

const setAt = (r: MeetPointRow) => Date.parse(r.set_at ?? r.created_at);
/**
 * Newest first: by set_at, then by when the server saved it. In Demo mode the clock often
 * doesn't move between tries, so several rows share one set_at; the last one saved wins.
 */
const newestFirst = (a: MeetPointRow, b: MeetPointRow) => setAt(b) - setAt(a) || Date.parse(b.created_at) - Date.parse(a.created_at);

/**
 * The current meet point (or split) at time t: the newest one set today, at or before t.
 * Ended ones are gone, except "together" for 10 min. Going by t (now()) means jumping the
 * demo clock back hides ones set later and brings back ones ended later.
 */
export function currentGathering(rows: MeetPointRow[], kind: GatherKind, t: number): Gathering | null {
  const today = todayISO(new Date(t));
  const row = rows
    .filter((r) => r.kind === kind && setAt(r) <= t && todayISO(new Date(setAt(r))) === today)
    .sort(newestFirst)[0];
  if (!row) return null;
  const endedAt = row.ended_at ? Date.parse(row.ended_at) : NaN;
  if (row.status === 'active' || Number.isNaN(endedAt) || endedAt > t) return { row, state: 'active' };
  if (row.status === 'together' && t - endedAt <= TOGETHER_SHOWN_MS) return { row, state: 'together' };
  return null;
}

/** "in 42 min", "now", "12 min ago". */
export function countdownText(at: number, t: number): string {
  const diff = Math.round((at - t) / MIN);
  if (diff === 0) return 'now';
  return diff > 0 ? `in ${durationText(diff)}` : `${durationText(-diff)} ago`;
}

/** "Split · rejoin at Clan Jetties at 15:00". */
export function splitTitle(row: Pick<MeetPointRow, 'name' | 'rejoin_at'>): string {
  return `Split · rejoin at ${row.name ?? 'the meet point'}${row.rejoin_at ? ` at ${clockOf(row.rejoin_at)}` : ''}`;
}

/** A tapped spot's name: the stop or pin it's on (within 60 m), else null ("Spot on the map"). */
export function nameForSpot(
  p: LatLng,
  stops: Pick<Stop, 'name' | 'lat' | 'lng' | 'status'>[],
  pins: Pick<Pin, 'type' | 'name' | 'lat' | 'lng'>[],
): string | null {
  let best: { name: string; m: number } | null = null;
  for (const s of stops) {
    if (s.status === 'dropped' || s.lat == null || s.lng == null) continue;
    const m = haversineMeters(p, { lat: s.lat, lng: s.lng });
    if (m <= NAME_NEAR_M && (!best || m < best.m)) best = { name: s.name, m };
  }
  for (const pin of pins) {
    const m = haversineMeters(p, pin);
    if (m <= NAME_NEAR_M && (!best || m < best.m)) best = { name: pinTitle(pin), m };
  }
  return best?.name ?? null;
}

export const SPOT_NAME = 'Spot on the map';

/** A Supabase / network error as a sentence for the screen, e.g. when saving a meet point fails. */
export function saveErrorText(e: unknown, doing = 'save it'): string {
  const err = (e ?? {}) as { code?: string; message?: string };
  const msg = err.message ?? String(e ?? '');
  if (err.code === 'PGRST204' || /column .* (does not exist|schema cache)/i.test(msg)) {
    return `Couldn't ${doing}: the database is missing the meet point columns. Run 011_meet_and_split.sql in Supabase.`;
  }
  if (err.code === '42501' || /row-level security/i.test(msg)) {
    return `Couldn't ${doing}: the server doesn't see you as a member of this trip. Open the trip again and retry.`;
  }
  if (err.code === '23503') return `Couldn't ${doing}: that stop or member no longer exists. Pick again.`;
  if (/network request failed|failed to fetch|fetch failed|timeout/i.test(msg)) {
    return `Couldn't ${doing}: no connection. Check your internet and try again.`;
  }
  return msg ? `Couldn't ${doing}: ${msg}` : `Couldn't ${doing}. Try again.`;
}
