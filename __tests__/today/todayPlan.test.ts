import type { Stop } from '@/features/planning/types';
import {
  directionsUrl,
  justLeftStop,
  lastLeftStop,
  longDate,
  paceLabel,
  todayView,
  travelModeTo,
  tripDayOn,
} from '@/features/today/todayPlan';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, 11 + day, h, m).toISOString();
const START = '2026-10-12';
const noon = (day: number) => new Date(2026, 9, 11 + day, 12, 0);

let n = 0;
function stop(day: number, name: string, h: number, extra: Partial<Stop> = {}): Stop {
  n += 1;
  return {
    id: `s${n}`,
    trip_id: 't1',
    day_number: day,
    position: n,
    name,
    address: null,
    lat: 5.41,
    lng: 100.33,
    planned_time: at(day, h),
    planned_end: at(day, h + 1),
    price: 10,
    is_estimate: true,
    is_booked: false,
    is_outdoor: false,
    tip: null,
    status: 'planned',
    arrived_at: null,
    left_at: null,
    actual_cost: null,
    category: 'sight',
    priority: 2,
    note: null,
    place_id: null,
    ...extra,
  };
}

const view = (stops: Stop[], now: Date, stage: 'decided' | 'voting' = 'decided') =>
  todayView({ stage, start: START, days: 3, stops, now });

describe('todayView', () => {
  const hill = stop(1, 'Penang Hill', 9, { status: 'done', arrived_at: at(1, 9, 4), left_at: at(1, 10, 50) });
  const temple = stop(1, 'Kek Lok Si', 11, { status: 'arrived', arrived_at: at(1, 11, 36) });
  const food = stop(1, 'Chulia Street food', 14);
  const murals = stop(1, 'Armenian Street', 16);
  const day2 = stop(2, 'Clan Jetties', 9);
  const stops = [hill, temple, food, murals, day2];

  it("shows today's Now, Next and Done", () => {
    const v = view(stops, noon(1));
    expect(v.kind).toBe('day');
    if (v.kind !== 'day') return;
    expect(v.day).toBe(1);
    expect(v.date).toBe('2026-10-12');
    expect(v.now?.name).toBe('Kek Lok Si');
    expect(v.next?.name).toBe('Chulia Street food');
    expect(v.after?.name).toBe('Armenian Street');
    expect(v.done.map((s) => s.name)).toEqual(['Penang Hill']);
    expect(v.total).toBe(4);
    expect(v.pace).toBe('36 min behind');
  });

  it('between stops there is no Now, and Next is the next planned stop', () => {
    const left = { ...temple, status: 'done' as const, left_at: at(1, 13) };
    const v = view([hill, left, food, murals], noon(1));
    if (v.kind !== 'day') throw new Error('expected a day');
    expect(v.now).toBeNull();
    expect(v.next?.name).toBe('Chulia Street food');
    expect(v.done).toHaveLength(2);
  });

  it('a skipped stop stays behind the group, it is not "next"', () => {
    const skipped = stop(1, 'Skipped', 8);
    const v = view([skipped, hill, temple, food], noon(1));
    if (v.kind !== 'day') throw new Error('expected a day');
    expect(v.next?.name).toBe('Chulia Street food');
  });

  it('uses the day the clock is on', () => {
    const v = view(stops, noon(2));
    if (v.kind !== 'day') throw new Error('expected a day');
    expect(v.day).toBe(2);
    expect(v.next?.name).toBe('Clan Jetties');
    expect(v.pace).toBeNull();
  });

  it('friendly reasons when there is no day to show', () => {
    expect(view(stops, noon(1), 'voting')).toMatchObject({ kind: 'no-plan', reason: 'not-built' });
    expect(view(stops, noon(-2))).toMatchObject({ kind: 'no-plan', reason: 'before', daysToGo: 3 });
    expect(view(stops, noon(4))).toMatchObject({ kind: 'no-plan', reason: 'after', endsOn: '2026-10-14' });
    expect(view(stops, noon(3))).toMatchObject({ kind: 'no-plan', reason: 'empty', day: 3 });
  });
});

describe('helpers', () => {
  it('paceLabel: up to 5 min late is on time', () => {
    expect(paceLabel([stop(1, 'a', 9, { arrived_at: at(1, 9, 5) })])).toBe('on time');
    expect(paceLabel([stop(1, 'a', 9, { arrived_at: at(1, 8, 50) })])).toBe('on time');
    expect(paceLabel([stop(1, 'a', 9, { arrived_at: at(1, 9, 12) })])).toBe('12 min behind');
    expect(paceLabel([stop(1, 'a', 9, { arrived_at: at(1, 10, 15) })])).toBe('1 h 15 min behind');
  });

  it('tripDayOn counts from the start date', () => {
    expect(tripDayOn(START, noon(1))).toBe(1);
    expect(tripDayOn(START, noon(0))).toBe(0);
  });

  it('longDate', () => {
    expect(longDate('2026-10-12')).toBe('Monday 12 Oct');
  });

  it('directionsUrl uses the position, or the name when there is none', () => {
    expect(directionsUrl({ lat: 5.4, lng: 100.3, name: 'x', address: null })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=5.4%2C100.3',
    );
    expect(directionsUrl({ lat: null, lng: null, name: 'Kek Lok Si', address: 'Air Itam' })).toContain(
      'destination=Kek%20Lok%20Si%2C%20Air%20Itam',
    );
  });

  it('directions walk under ~2 km and drive further, and let Maps pick when the start is unknown', () => {
    const komtar = { lat: 5.4145, lng: 100.3292 };
    const murals = { lat: 5.4152, lng: 100.3376, name: 'Armenian Street', address: null }; // ~0.9 km
    const hill = { lat: 5.4249, lng: 100.269, name: 'Penang Hill', address: null }; // ~6.8 km
    expect(travelModeTo(komtar, murals)).toBe('walking');
    expect(travelModeTo(komtar, hill)).toBe('driving');
    expect(travelModeTo(null, hill)).toBeNull();
    expect(directionsUrl(murals, travelModeTo(komtar, murals))).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=5.4152%2C100.3376&travelmode=walking',
    );
    expect(directionsUrl(hill, 'driving')).toMatch(/&travelmode=driving$/);
  });
});

describe('justLeftStop: "Just left" until everything about leaving is answered, then "On the way"', () => {
  const t = (h: number, m = 0) => Date.parse(at(1, h, m));
  const a = stop(1, 'Cafe', 9, { status: 'done', arrived_at: at(1, 9), left_at: at(1, 9, 50) });
  const b = stop(1, 'Hill', 11, { status: 'done', arrived_at: at(1, 11), left_at: at(1, 11, 40) });
  const c = stop(1, 'Hawkers', 13);
  const dayStops = [a, b, c];
  const base = { dayStops, now: t(11, 45), atStop: false, spendStop: null, late: false };

  it('shows the stop the spend check asks about', () => {
    expect(justLeftStop({ ...base, spendStop: b })).toBe(b);
  });

  it('shows the stop an open early card left, even after the spend check is answered', () => {
    expect(justLeftStop({ ...base, earlyLeftId: b.id })).toBe(b);
    expect(justLeftStop({ ...base, earlyLeftId: null })).toBe(b);
  });

  it('keeps showing it while a running-late card is open (the stop left last)', () => {
    expect(justLeftStop({ ...base, late: true })).toBe(b);
  });

  it('is null once all are answered (On the way), and at a stop', () => {
    expect(justLeftStop(base)).toBeNull();
    expect(justLeftStop({ ...base, atStop: true, spendStop: b, late: true })).toBeNull();
  });

  it('lastLeftStop ignores leaves after now (Demo mode Reset)', () => {
    expect(lastLeftStop(dayStops, t(11, 45))).toBe(b);
    expect(lastLeftStop(dayStops, t(10))).toBe(a);
    expect(lastLeftStop(dayStops, t(9))).toBeNull();
  });
});

describe('todayView for a day kept open past midnight', () => {
  it('shows the open day (its stops and date), not the calendar day', () => {
    const stops = [stop(1, 'Night market', 19, { status: 'done' }), stop(2, 'Beach', 8)];
    const v = todayView({ stage: 'decided', start: START, days: 3, stops, now: new Date(2026, 9, 13, 0, 30), day: 1 });
    expect(v).toMatchObject({ kind: 'day', day: 1, date: '2026-10-12' });
    // Without an open day it is Day 2 by the calendar.
    expect(view(stops, new Date(2026, 9, 13, 0, 30))).toMatchObject({ kind: 'day', day: 2 });
  });
});
