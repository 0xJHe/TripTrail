import { sortStops } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import { haversineMeters, offsetMeters, type LatLng } from '@/lib/distance';
import type { DemoEvent, DemoMemberTrack, DemoRoute } from '@/lib/location';
import { CHECK_BEFORE_MIN, estimateMinutes, LATE_AFTER_MIN } from '@/supabase/functions/_shared/eta';

/**
 * Builds the fake day that Demo mode replays, from the trip's real Day plan.
 * The group walks stop to stop on the plan's times, with four moments added:
 * arriving late at one stop, leaving one stop early, rain near an outdoor stop,
 * and one member 900 m from the group with low battery.
 */

export type RouteStop = Pick<
  Stop,
  'id' | 'name' | 'day_number' | 'position' | 'lat' | 'lng' | 'planned_time' | 'planned_end' | 'is_outdoor' | 'status'
> &
  Partial<Pick<Stop, 'is_booked'>>;

export interface RouteMember {
  id: string;
  name: string;
}

const MIN = 60_000;
/** How late the group arrives at the "late" stop. */
export const LATE_BY_MIN = 20;
/** The way to the late stop takes at least this long. */
export const LATE_LEG_MIN = 12;
/** Extra late at the running-late moment, so Google's real travel time (often shorter than the estimate) still says late. */
export const LATE_MARGIN_MIN = 10;
/** How far the wandering member gets from the rest of the group. */
export const FAR_M = 900;
const LEAD_IN_MIN = 30;
const FAKE_NAMES = ['Aisha', 'Ben', 'Mei', 'Raj'];
const GROUP_SIZE = 4;
// Small spread so members aren't drawn on top of each other (metres east, north).
const SPREAD = [
  [0, 0],
  [14, -9],
  [-11, 13],
  [8, 18],
  [-16, -6],
  [19, 5],
];

type Usable = RouteStop & { lat: number; lng: number; planned_time: string };

/** Stops a route can use: in the plan, with a time and a place. */
function usableStops(stops: RouteStop[], day?: number): Usable[] {
  return sortStops(stops).filter(
    (s): s is Usable =>
      (day == null || s.day_number === day) && s.lat != null && s.lng != null && s.planned_time != null,
  );
}

/** Days that can be replayed, with when each replay starts (30 min before the first stop). */
export function demoDays(stops: RouteStop[]): { day: number; startsAt: number }[] {
  const firsts = new Map<number, number>();
  for (const s of usableStops(stops)) {
    if (!firsts.has(s.day_number)) firsts.set(s.day_number, Date.parse(s.planned_time) - LEAD_IN_MIN * MIN);
  }
  return [...firsts].map(([day, startsAt]) => ({ day, startsAt })).sort((a, b) => a.day - b.day);
}

/** The day to replay at time t: the last day whose replay has started, else the first. */
export function pickDemoDay(stops: RouteStop[], t: number | null): number | null {
  const days = demoDays(stops);
  if (days.length === 0) return null;
  if (t == null) return days[0].day;
  return [...days].reverse().find((d) => d.startsAt <= t)?.day ?? days[0].day;
}

/** Rough door-to-door time: walk up to 1.2 km, else a car at ~25 km/h plus 5 min. */
export function travelMs(a: LatLng, b: LatLng): number {
  const m = haversineMeters(a, b);
  const minutes = m <= 1200 ? m / 80 : m / 417 + 5;
  return Math.max(3, Math.round(minutes)) * MIN;
}

const LEAD_IN_M = 1500;

/** Metres from p to the segment a-b (flat map around a; fine for a few km). */
function metersToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const kx = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const ky = 110_540;
  const [px, py] = [(p.lng - a.lng) * kx, (p.lat - a.lat) * ky];
  const [bx, by] = [(b.lng - a.lng) * kx, (b.lat - a.lat) * ky];
  const len = bx * bx + by * by;
  const f = len === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len));
  return Math.hypot(px - f * bx, py - f * by);
}

/**
 * Where the day's walk starts: 1.5 km from the first stop, from the side that keeps the
 * walk in furthest from the day's other stops (passing within 100 m would tick one off).
 */
function leadInStart(at: LatLng[]): LatLng {
  let best = { p: offsetMeters(at[0], -LEAD_IN_M * Math.SQRT1_2, -LEAD_IN_M * Math.SQRT1_2), clear: -1 };
  for (let k = 0; k < 8; k++) {
    const angle = Math.PI * (1.25 + k / 4); // south-west first, then round the compass
    const p = offsetMeters(at[0], LEAD_IN_M * Math.cos(angle), LEAD_IN_M * Math.sin(angle));
    const clear = Math.min(Infinity, ...at.slice(1).map((s) => metersToSegment(s, p, at[0])));
    if (clear > best.clear + 1) best = { p, clear };
  }
  return best.p;
}

/** Index of the stop with the longest stay among `candidates` (first one wins ties). */
function longest(candidates: number[], stay: (i: number) => number): number | undefined {
  return candidates.reduce<number | undefined>((best, i) => (best == null || stay(i) > stay(best) ? i : best), undefined);
}

interface BuildInput {
  tripId: string;
  day: number;
  /** All the trip's stops; only this day's are used. */
  stops: RouteStop[];
  members: RouteMember[];
  /** This phone's member id. */
  meId: string | null;
}

export function buildDemoRoute({ tripId, day, stops, members, meId }: BuildInput): DemoRoute | null {
  const s = usableStops(stops, day);
  const n = s.length;
  if (n === 0) return null;
  const at = s.map((x) => ({ lat: x.lat, lng: x.lng }));
  const start = s.map((x) => Date.parse(x.planned_time));
  const end = s.map((x, i) => {
    const planned = x.planned_end
      ? Date.parse(x.planned_end)
      : Math.min(start[i] + 60 * MIN, (start[i + 1] ?? Infinity) - 10 * MIN);
    return Math.max(planned, start[i] + 10 * MIN);
  });
  const idx = s.map((_, i) => i);

  // Which stop gets which moment. Late: the second stop (the third if the second is booked),
  // so the suggested new day has most of the day to rearrange, like prototype screen 7.
  const legMs = (i: number) => (i > 0 ? travelMs(at[i - 1], at[i]) : 0);
  const late = n >= 2 ? (n >= 3 && s[1].is_booked && !s[2].is_booked ? 2 : 1) : 0;
  const plannedStay = (i: number) => end[i] - start[i];
  const notLate = idx.filter((i) => i !== late);
  const early = notLate.find((i) => i > late && plannedStay(i) >= 30 * MIN) ?? longest(notLate, plannedStay) ?? late;
  const outdoor = idx.filter((i) => s[i].is_outdoor);
  const rain = outdoor.find((i) => i > early) ?? outdoor.find((i) => i !== late) ?? outdoor[0] ?? n - 1;
  // Not the stop before the late one: the group waits there for the running-late check.
  const free = idx.filter((i) => i !== late && i !== late - 1 && i !== early && i !== rain);
  const far =
    longest(free, plannedStay) ?? longest(notLate.filter((i) => i !== late - 1), plannedStay) ?? longest(notLate, plannedStay) ?? n - 1;

  // Arrive / leave times.
  const arrive = [...start];
  const leave = [...end];
  arrive[late] += LATE_BY_MIN * MIN;
  const earlyBy = Math.min(40 * MIN, end[early] - arrive[early] - 5 * MIN);
  if (earlyBy > 0) leave[early] = end[early] - earlyBy;
  // Running late shows through the check ~30 min before the late stop starts, while the group
  // is still at the stop before: they stay there until the free estimate from there says late.
  const checkFrom = start[late] - CHECK_BEFORE_MIN * MIN;
  const lateBy =
    late > 0 ? start[late] + (LATE_AFTER_MIN + LATE_MARGIN_MIN) * MIN - estimateMinutes(at[late - 1], at[late]) * MIN : start[0];
  let lateAt = start[0];
  for (let i = 0; i < n; i++) {
    if (i === late && late > 0) {
      // Arriving at the stop before inside the check window would run the check too soon: arrive late there too.
      if (arrive[i - 1] >= checkFrom - MIN) arrive[i - 1] = Math.max(arrive[i - 1], lateBy);
      lateAt = Math.max(checkFrom, lateBy, arrive[i - 1] + MIN);
      const tr = Math.max(legMs(i), LATE_LEG_MIN * MIN);
      arrive[i] = Math.max(arrive[i], lateAt + 5 * MIN + tr);
      leave[i - 1] = Math.max(leave[i - 1], arrive[i - 1] + 5 * MIN);
    }
    if (i > 0) {
      const tr = i === late ? Math.max(legMs(i), LATE_LEG_MIN * MIN) : legMs(i);
      // Late stop: they stayed too long at the one before. Otherwise they leave in time to be on time.
      leave[i - 1] = i === late ? Math.max(leave[i - 1], arrive[i] - tr) : Math.min(leave[i - 1], arrive[i] - tr);
      leave[i - 1] = Math.max(leave[i - 1], arrive[i - 1] + 5 * MIN);
      arrive[i] = Math.max(arrive[i], leave[i - 1] + 3 * MIN);
    }
    leave[i] = Math.max(leave[i], arrive[i] + 5 * MIN);
  }

  const startsAt = start[0] - LEAD_IN_MIN * MIN;
  const farStart = arrive[far] + 10 * MIN;
  const farReach = farStart + 10 * MIN;
  const farBack = Math.max(farReach + 10 * MIN, leave[far] - 15 * MIN);
  const rejoin = farBack + 10 * MIN;
  const endsAt = Math.max(leave[n - 1] + 30 * MIN, rejoin + 10 * MIN);

  // Group path: from 1.5 km out, then stop to stop.
  const group = [{ t: startsAt, ...leadInStart(at) }];
  for (let i = 0; i < n; i++) group.push({ t: arrive[i], ...at[i] }, { t: leave[i], ...at[i] });
  group.push({ t: endsAt, ...at[n - 1] });

  // Members: the trip's, padded with made-up friends so there is a group to see.
  const people: (RouteMember & { isMe: boolean; fake: boolean })[] = members.map((m) => ({
    ...m,
    isMe: m.id === meId,
    fake: false,
  }));
  if (!people.some((p) => p.isMe)) people.unshift({ id: meId ?? 'me', name: 'You', isMe: true, fake: false });
  for (const name of FAKE_NAMES) {
    if (people.length >= GROUP_SIZE) break;
    if (people.some((p) => p.name === name)) continue;
    people.push({ id: `demo-${name.toLowerCase()}`, name: `${name} (demo)`, isMe: false, fake: true });
  }
  // The last member who isn't this phone wanders off.
  const drifter = people.length - 1 - [...people].reverse().findIndex((p) => !p.isMe);
  const spread = people.map((_, i) => SPREAD[i % SPREAD.length]);
  const others = spread.filter((_, i) => i !== drifter);
  const cx = others.reduce((sum, o) => sum + o[0], 0) / others.length;
  const cy = others.reduce((sum, o) => sum + o[1], 0) / others.length;
  const away = { east: cx + FAR_M * Math.SQRT1_2, north: cy + FAR_M * Math.SQRT1_2 };

  const tracks: DemoMemberTrack[] = people.map((p, i) => {
    const home = { east: spread[i][0], north: spread[i][1] };
    if (i !== drifter) {
      const full = 92 - 6 * i;
      return {
        ...p,
        offsets: [{ t: startsAt, ...home }],
        battery: [
          { t: startsAt, value: full },
          { t: endsAt, value: full - 22 },
        ],
      };
    }
    return {
      ...p,
      offsets: [
        { t: startsAt, ...home },
        { t: farStart, ...home },
        { t: farReach, ...away },
        { t: farBack, ...away },
        { t: rejoin, ...home },
      ],
      battery: [
        { t: startsAt, value: 41 },
        { t: farStart, value: 19 },
        { t: farReach, value: 13 },
        { t: endsAt, value: 6 },
      ],
    };
  });
  const wanderer = tracks[drifter];

  // Rain over the outdoor stop, wide enough to cover the way there from the stop before.
  const radiusM = Math.max(3000, rain > 0 ? haversineMeters(at[rain - 1], at[rain]) + 500 : 3000);
  const rainZone = { ...at[rain], radiusM, startsAt: arrive[rain] + 10 * MIN, endsAt: arrive[rain] + 70 * MIN };
  const rainFrom = Math.max(arrive[rain] - 45 * MIN, rain > 0 ? arrive[rain - 1] : startsAt);
  // Nothing else happens between the running-late check window opening and the late moment.
  const rainAt = rainFrom >= checkFrom && rainFrom < lateAt ? lateAt + MIN : rainFrom;


  const events: DemoEvent[] = [{ at: startsAt, kind: 'start', title: `Day ${day} starts: heading to ${s[0].name}` }];
  s.forEach((x, i) => {
    const lateMin = Math.round((arrive[i] - start[i]) / MIN);
    events.push({
      at: arrive[i],
      kind: 'arrive',
      stopId: x.id,
      title: lateMin > 5 ? `Arrived at ${x.name}, ${lateMin} min late` : `Arrived at ${x.name}`,
    });
    const earlyMin = Math.round((end[i] - leave[i]) / MIN);
    events.push(
      i === early && earlyMin > 20
        ? { at: leave[i], kind: 'early', stopId: x.id, title: `Left ${x.name} ${earlyMin} min early` }
        : { at: leave[i], kind: 'leave', stopId: x.id, title: `Left ${x.name}` },
    );
  });
  const outdoorNote = s[rain].is_outdoor ? ' (outdoor stop)' : '';
  events.push(
    { at: lateAt, kind: 'late', stopId: s[late].id, title: `Running late for ${s[late].name}` },
    { at: rainAt, kind: 'rain', stopId: s[rain].id, title: `Rain coming at ${s[rain].name}${outdoorNote}` },
    {
      at: farReach,
      kind: 'far',
      memberId: wanderer.id,
      title: `${wanderer.name} is ${FAR_M} m from the group, battery 13%`,
    },
    { at: rejoin, kind: 'rejoin', memberId: wanderer.id, title: `${wanderer.name} is back with the group` },
  );
  events.sort((a, b) => a.at - b.at);

  const nextDay = demoDays(stops).find((d) => d.day > day);
  return {
    tripId,
    day,
    startsAt,
    endsAt,
    group,
    members: tracks,
    rain: [rainZone],
    events,
    nextDayStartsAt: nextDay?.startsAt ?? null,
  };
}
