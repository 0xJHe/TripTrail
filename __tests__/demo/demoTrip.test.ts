import { readFileSync } from 'fs';
import { join } from 'path';

import { buildDemoRoute, demoReadiness, demoTravelMin, type RouteStop } from '@/features/demo/route';
import { halalLabels, isFoodStop } from '@/features/planning/halal';
import { someoneNeeds } from '@/features/planning/optionFit';
import type { Preferences, Stop } from '@/features/planning/types';
import { emptyTracker, processReadings, readingTimes } from '@/features/today/arrival';
import { earlyCheck } from '@/features/today/early';
import { lateAlertFor } from '@/features/today/late';
import { centroid, haversineMeters } from '@/lib/distance';
import { sampleRoute, type DemoRoute } from '@/lib/location';
import { estimateMinutes } from '@/supabase/functions/_shared/eta';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The Penang demo template, read straight from the SQL that saves it (one source of truth).
const root = join(__dirname, '..', '..');
const seed = readFileSync(join(root, 'supabase', 'seed_demo_trip.sql'), 'utf8');
const migration = readFileSync(join(root, 'supabase', 'migrations', '019_demo_trip.sql'), 'utf8');
const schema = readFileSync(join(root, 'supabase', 'schema.sql'), 'utf8');

type SeedStop = Pick<
  Stop,
  'day_number' | 'position' | 'name' | 'address' | 'lat' | 'lng' | 'planned_time' | 'planned_end' | 'price' | 'category' | 'is_outdoor' | 'priority' | 'tip' | 'place_id'
> & { halal_available?: boolean };
const seedStops: SeedStop[] = JSON.parse(seed.match(/\$stops\$([\s\S]*?)\$stops\$/)![1]);

const MIN = 60_000;
const stops: (Stop & { halal_available?: boolean })[] = seedStops.map((s, i) => ({
  ...s,
  id: `s${i}`,
  trip_id: 't1',
  is_estimate: true,
  is_booked: false,
  status: 'planned',
  arrived_at: null,
  left_at: null,
  actual_cost: null,
  note: null,
}));
const dayOf = (d: number) => stops.filter((s) => s.day_number === d);
/** Minutes after midnight, Malaysia time (+08). */
const myClock = (iso: string) => {
  const d = new Date(Date.parse(iso) + 8 * 60 * MIN);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

// JAKIM's Malaysia Halal Portal (Premis Makanan), checked 13 Oct 2026; see the seed's header.
const JAKIM = ['Nasi Kandar Pelita', 'Garden Cafe • Golden Sands Resort • Penang'];

describe('Penang demo template: the plan', () => {
  it('is 2 days of 5 to 7 stops, each with a real place, times, a price, a category and a tip', () => {
    expect([...new Set(stops.map((s) => s.day_number))]).toEqual([1, 2]);
    for (const d of [1, 2]) expect(dayOf(d).length).toBeGreaterThanOrEqual(5);
    for (const d of [1, 2]) expect(dayOf(d).length).toBeLessThanOrEqual(7);
    for (const s of stops) {
      expect(s.place_id).toMatch(/^ChIJ/);
      expect(s.address).toMatch(/Pinang|Penang/);
      expect(s.lat).toBeGreaterThan(5.2);
      expect(s.lat).toBeLessThan(5.6);
      expect(s.lng).toBeGreaterThan(100.1);
      expect(s.lng).toBeLessThan(100.5);
      expect(s.price).toBeGreaterThanOrEqual(0);
      expect(['sight', 'food', 'beach']).toContain(s.category);
      expect(typeof s.is_outdoor).toBe('boolean');
      expect(s.tip!.length).toBeGreaterThan(20);
      expect(s.tip!.length).toBeLessThan(140);
      expect(Date.parse(s.planned_end!)).toBeGreaterThan(Date.parse(s.planned_time!));
    }
  });

  it('never overlaps two stops, in order of position', () => {
    for (const d of [1, 2]) {
      const day = dayOf(d).sort((a, b) => a.position - b.position);
      day.forEach((s, i) => i > 0 && expect(Date.parse(s.planned_time!)).toBeGreaterThanOrEqual(Date.parse(day[i - 1].planned_end!)));
    }
  });

  it('has an outdoor stop, a lunch and a dinner every day', () => {
    for (const d of [1, 2]) {
      const day = dayOf(d);
      expect(day.some((s) => s.is_outdoor)).toBe(true);
      const meals = day.filter(isFoodStop).map((s) => myClock(s.planned_time!));
      expect(meals.some((m) => m >= 11 * 60 + 30 && m <= 14 * 60)).toBe(true); // lunch
      expect(meals.some((m) => m >= 18 * 60 && m <= 20 * 60 + 30)).toBe(true); // dinner
    }
  });

  it('uses the JAKIM-certified restaurants as a lunch and a dinner', () => {
    const certified = stops.filter((s) => JAKIM.includes(s.name));
    expect(certified).toHaveLength(2);
    for (const s of certified) {
      expect(s.category).toBe('food');
      expect(s.halal_available).toBe(true);
    }
    expect(myClock(certified[0].planned_time!)).toBeLessThan(14 * 60); // Day 1 lunch
    expect(myClock(certified[1].planned_time!)).toBeGreaterThanOrEqual(18 * 60); // Day 2 dinner
    // Only listed places are marked halal.
    expect(stops.filter((s) => s.halal_available).map((s) => s.name)).toEqual(JAKIM);
  });

  it('has a made-up "(demo)" member who needs halal food, so food stops get the tag and the JAKIM link', () => {
    expect(seed).toMatch(/'Aisha \(demo\)', null, true\)/);
    const food = seed.match(/values \(aisha, tpl, (\d+), array\[[^\]]*\]::date\[\], array\[([^\]]*)\]/)!;
    expect(Number(food[1])).toBeGreaterThan(0);
    expect(food[2]).toContain("'Halal'");
    const prefs = [{ food_needs: ['Halal'] } as Preferences];
    expect(someoneNeeds(prefs, 'Halal')).toBe(true);
    for (const s of stops.filter(isFoodStop)) expect(halalLabels(s, true)).toEqual({ tag: true, jakim: true });
  });

  it('is ready for Demo mode (times and places)', () => {
    expect(demoReadiness(stops)).toBe('ready');
  });
});

// Demo mode on the copy: a phone with one real member (the person who tapped Try a demo trip).
const me = [{ id: 'me', name: 'Harein' }];
const routeOf = (day: number): DemoRoute => buildDemoRoute({ tripId: 't1', day, stops, members: me, meId: 'me' })!;
const event = (r: DemoRoute, kind: string) => r.events.find((e) => e.kind === kind)!;

describe.each([
  [1, 'Nasi Kandar Pelita', 'Leong San Tong Khoo Kongsi', 'Gurney Drive Hawker Center', 'Fort Cornwallis'],
  [2, 'Kek Lok Si Temple', 'Penang Air Itam Laksa', 'Batu Ferringhi Beach', 'Kek Lok Si Temple'],
])('Demo mode on Day %i', (day, lateName, earlyName, rainName, farName) => {
  const route = routeOf(day);
  const plan = dayOf(day);
  const byId = (id?: string) => plan.find((s) => s.id === id)!;
  // The phone's arrive / leave tracker on the replayed walk (30 s readings), as on Today.
  const visits = processReadings(
    emptyTracker(),
    plan,
    readingTimes(route.startsAt - 30_000, route.endsAt, 30_000).map((t) => ({ ...sampleRoute(route, t).me!, at: t })),
  ).changes;
  const visited = (s: Stop): Stop => ({ ...s, ...visits.find((c) => c.stopId === s.id) });

  it('has every moment: late, early, rain, far from the group and the end of the day', () => {
    expect(route.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['late', 'early', 'rain', 'far', 'rejoin', 'end']));
    expect(route.events[route.events.length - 1].kind).toBe('end');
    expect(byId(event(route, 'late').stopId).name).toBe(lateName);
    expect(byId(event(route, 'early').stopId).name).toBe(earlyName);
    expect(byId(event(route, 'rain').stopId).name).toBe(rainName);
    // The member wanders off from this stop (route.ts: the far moment's stop).
    const far = event(route, 'far').at;
    const at = plan.filter((s) => Date.parse(visited(s).arrived_at!) <= far).pop()!;
    expect(at.name).toBe(farName);
  });

  it('ticks every stop off and leaves it, so the day can end', () => {
    for (const s of plan) expect(visited(s).status).toBe('done');
  });

  it('shows the running-late card before the late stop starts', () => {
    const late = event(route, 'late');
    const next = byId(late.stopId) as Stop & { planned_time: string };
    expect(late.at).toBeLessThan(Date.parse(next.planned_time));
    const travelMin = demoTravelMin(route, next.id, late.at)!;
    expect(lateAlertFor({ tripId: 't1', next, dayStops: plan, now: late.at, travelMin, source: 'estimate' })).not.toBeNull();
  });

  it('shows the running-early card when the group leaves the early stop', () => {
    const early = event(route, 'early');
    const left = visited(byId(early.stopId));
    const next = plan[plan.findIndex((s) => s.id === left.id) + 1];
    const travelMin = estimateMinutes(left as { lat: number; lng: number }, next as { lat: number; lng: number });
    const card = earlyCheck({ left, next, now: early.at, travelMin, lateAlerts: [], earlyAlerts: [] });
    expect(card).not.toBeNull();
    expect(card!.aheadMin).toBeGreaterThanOrEqual(15);
    expect(card!.spareMin).toBeGreaterThanOrEqual(30);
  });

  it('brings rain within the hour over an outdoor stop', () => {
    const rain = event(route, 'rain');
    expect(byId(rain.stopId).is_outdoor).toBe(true);
    expect(sampleRoute(route, rain.at).rainSoon).toBe(true);
  });

  it('sends a made-up member 900 m from the group with low battery', () => {
    const far = event(route, 'far');
    const loc = sampleRoute(route, far.at);
    const drifter = loc.members.find((m) => m.id === far.memberId)!;
    expect(drifter.name).toMatch(/\(demo\)$/);
    expect(haversineMeters(drifter, centroid(loc.members.filter((m) => m.id !== drifter.id))!)).toBeGreaterThan(500);
    expect(drifter.battery).toBeLessThan(15);
  });

  it('pads the group with made-up friends, Aisha (demo) among them', () => {
    expect(route.members.map((m) => m.name)).toContain('Aisha (demo)');
  });
});

describe('Try a demo trip SQL', () => {
  const fn = migration.slice(migration.indexOf('create or replace function start_demo_trip'));

  it('copies the plan, the made-up members and their preferences, and nothing else', () => {
    for (const table of ['trips', 'members', 'preferences', 'stops']) expect(fn).toMatch(new RegExp(`insert into ${table}\\b`));
    for (const table of ['votes', 'locations', 'spends', 'pins', 'late_alerts', 'early_alerts', 'rain_alerts', 'meet_points', 'day_closures', 'demo_sessions', 'trip_options'])
      expect(fn).not.toMatch(new RegExp(`insert into ${table}\\b`));
    // Stops keep places, prices, categories and tips; times move to the new dates.
    for (const col of ['name', 'address', 'lat', 'lng', 'price', 'category', 'tip', 'place_id', 'is_outdoor'])
      expect(fn).toMatch(new RegExp(`s\\.${col}\\b`));
    expect(fn).toMatch(/planned_time \+ make_interval\(days => shift\)/);
  });

  it('reuses an unfinished copy, and makes a new one only for this person', () => {
    expect(fn).toMatch(/t\.demo_of is not null and \(t\.end_date is null or t\.end_date >= today\)/);
    expect(fn).toMatch(/me\.user_id = uid/);
    expect(fn).toMatch(/pg_advisory_xact_lock/);
  });

  it('keeps templates and copies private: no joining by code, made-up members never count', () => {
    for (const sql of [migration, schema]) {
      expect(sql).toMatch(/and demo_of is null\s+and not exists \(select 1 from demo_templates/);
      expect(sql).toMatch(/from members where trip_id = p_trip and not is_demo\)/);
      expect(sql).toMatch(/alter table demo_templates enable row level security/);
      expect(sql).toMatch(/grant execute on function start_demo_trip\(text\) to authenticated/);
    }
  });
});
