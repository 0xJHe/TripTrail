import { clockOf } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { centroid, haversineMeters, type LatLng } from '@/lib/distance';
import type { LocationRow } from './types';

const MIN = 60_000;
/** A member further than this from the group's centre gets the far-from-group alert. */
export const FAR_FROM_GROUP_M = 500;
/** Below this battery % a member gets the low-battery alert (and is shown as "last seen"). */
export const LOW_BATTERY = 15;
/** A position older than this is shown as "last seen [time]". */
export const STALE_MS = 3 * MIN;
/** Positions are shared from this long before the day's first stop... */
export const SHARE_BEFORE_MS = 60 * MIN;
/** ...until this long after the day's last stop ends. */
export const SHARE_AFTER_MS = 60 * MIN;

/** One person on the group map. */
export interface MapMember extends LatLng {
  id: string;
  /** Full display name. */
  name: string;
  isMe: boolean;
  /** Battery %, null when unknown. */
  battery: number | null;
  /** When this position was read (ms). */
  seenAt: number;
}

export interface FarMember {
  member: MapMember;
  /** Metres from the group's centre. */
  distanceM: number;
}

/** "Aisha" from "Aisha Rahman", "Mei" from "Mei (demo)". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * The group's centre: the middle of the biggest cluster (everyone within 500 m of one
 * member, the one with the most people near them; this phone wins a tie). Using the
 * cluster rather than everyone keeps one far-away member from dragging the centre
 * towards them, so "Daniel is 900 m from the group" is measured from the rest.
 */
export function groupCentre(members: MapMember[]): LatLng | null {
  if (members.length === 0) return null;
  const near = (a: MapMember) => members.filter((b) => haversineMeters(a, b) <= FAR_FROM_GROUP_M);
  let best = members[0];
  let bestCount = -1;
  let bestSpread = Infinity;
  for (const m of members) {
    const count = near(m).length;
    const spread = members.reduce((s, b) => s + haversineMeters(m, b), 0);
    const better =
      count > bestCount ||
      (count === bestCount && m.isMe && !best.isMe) ||
      (count === bestCount && m.isMe === best.isMe && spread < bestSpread);
    if (better) {
      best = m;
      bestCount = count;
      bestSpread = spread;
    }
  }
  return centroid(near(best));
}

/** Members more than 500 m from the group's centre, furthest first. Needs 2+ people. */
export function farMembers(members: MapMember[]): FarMember[] {
  if (members.length < 2) return [];
  const centre = groupCentre(members);
  if (!centre) return [];
  return members
    .map((member) => ({ member, distanceM: haversineMeters(member, centre) }))
    .filter((f) => f.distanceM > FAR_FROM_GROUP_M)
    .sort((a, b) => b.distanceM - a.distanceM);
}

/** Members whose battery is below 15%, lowest first. */
export function lowBatteryMembers(members: MapMember[]): MapMember[] {
  return members
    .filter((m) => m.battery != null && m.battery < LOW_BATTERY)
    .sort((a, b) => (a.battery ?? 0) - (b.battery ?? 0));
}

/** "900 m", "1.2 km". */
export function distanceText(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** "Daniel is 900 m from the group" / "You are 900 m from the group". */
export function farText(f: FarMember): string {
  const d = distanceText(f.distanceM);
  return f.member.isMe ? `You are ${d} from the group` : `${firstName(f.member.name)} is ${d} from the group`;
}

/** "Mei's battery is 12% — may go dark soon" / "Your battery is 12% — ...". */
export function lowBatteryText(m: MapMember): string {
  const who = m.isMe ? 'Your' : `${firstName(m.name)}'s`;
  return `${who} battery is ${m.battery}% — may go dark soon`;
}

/** Show "last seen [time]" for a member: battery low (may go dark) or no new position for 3 min. */
export function showLastSeen(m: MapMember, t: number): boolean {
  if (m.isMe) return false;
  return (m.battery != null && m.battery < LOW_BATTERY) || t - m.seenAt > STALE_MS;
}

/** "last seen 14:20". */
export function lastSeenText(m: Pick<MapMember, 'seenAt'>): string {
  return `last seen ${clockOf(new Date(m.seenAt).toISOString())}`;
}

/** "Aisha · 84%", "You · 80%", "Ravi" (battery unknown). */
export function memberLabel(m: MapMember): string {
  const name = m.isMe ? 'You' : firstName(m.name);
  return m.battery == null ? name : `${name} · ${m.battery}%`;
}

/** The newest row per member. */
export function latestByMember(rows: LocationRow[]): Map<string, LocationRow> {
  const out = new Map<string, LocationRow>();
  for (const r of rows) {
    const had = out.get(r.member_id);
    if (!had || Date.parse(r.recorded_at) > Date.parse(had.recorded_at)) out.set(r.member_id, r);
  }
  return out;
}

/** When phones share their position on a trip day: 60 min before the first stop to 60 min after the last. */
export function sharingWindow(
  dayStops: Pick<Stop, 'planned_time' | 'planned_end' | 'status'>[],
): { from: number; to: number } | null {
  const times = dayStops
    .filter((s) => s.status !== 'dropped' && s.planned_time)
    .map((s) => ({ start: Date.parse(s.planned_time!), end: Date.parse(s.planned_end ?? s.planned_time!) }))
    .filter((s) => !Number.isNaN(s.start));
  if (times.length === 0) return null;
  const first = Math.min(...times.map((s) => s.start));
  const last = Math.max(...times.map((s) => (Number.isNaN(s.end) ? s.start : s.end)));
  return { from: first - SHARE_BEFORE_MS, to: last + SHARE_AFTER_MS };
}

export const inWindow = (w: { from: number; to: number } | null, t: number) => !!w && t >= w.from && t <= w.to;

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Smallest span shown (about 700 m), so one person isn't zoomed in to the street. */
export const MIN_DELTA = 0.0065;

/** A map region around `centre` that fits every point, with some room at the edges. */
export function regionAround(centre: LatLng, points: LatLng[]): MapRegion {
  let dLat = 0;
  let dLng = 0;
  for (const p of points) {
    dLat = Math.max(dLat, Math.abs(p.lat - centre.lat));
    dLng = Math.max(dLng, Math.abs(p.lng - centre.lng));
  }
  return {
    latitude: centre.lat,
    longitude: centre.lng,
    latitudeDelta: Math.max(MIN_DELTA, dLat * 2 * 1.35),
    longitudeDelta: Math.max(MIN_DELTA, dLng * 2 * 1.35),
  };
}

/** The next stop still to come today: the first one not yet arrived at, done or dropped. */
export function nextStop<T extends Pick<Stop, 'status' | 'lat' | 'lng'>>(dayStops: T[]): T | null {
  return dayStops.find((s) => s.status === 'planned' && s.lat != null && s.lng != null) ?? null;
}

/**
 * What the camera fits: every member (the far one too) and the next stop. With nobody on
 * the map, the given stops instead (today's, or the trip's when it isn't a trip day).
 */
export function cameraPoints(members: LatLng[], stops: Pick<Stop, 'status' | 'lat' | 'lng'>[]): LatLng[] {
  const placed = stops.filter((s) => s.status !== 'dropped' && s.lat != null && s.lng != null);
  if (members.length === 0) return placed.map((s) => ({ lat: s.lat!, lng: s.lng! }));
  const next = nextStop(placed);
  const points = members.map((m) => ({ lat: m.lat, lng: m.lng }));
  return next ? [...points, { lat: next.lat!, lng: next.lng! }] : points;
}
