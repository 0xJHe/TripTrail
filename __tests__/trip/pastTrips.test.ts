import { organiserId } from '@/features/trip/members';
import { isPastTrip, pastTripsLabel, splitTrips } from '@/features/trip/pastTrips';

describe('past trips', () => {
  const trips = [
    { id: 'a', end_date: null },
    { id: 'b', end_date: '2026-10-11' },
    { id: 'c', end_date: '2026-10-12' },
    { id: 'd', end_date: '2026-09-01' },
    { id: 'e', end_date: '2026-11-03' },
  ];

  it('is past only once the last day is over', () => {
    expect(isPastTrip({ end_date: '2026-10-11' }, '2026-10-12')).toBe(true);
    expect(isPastTrip({ end_date: '2026-10-12' }, '2026-10-12')).toBe(false);
    expect(isPastTrip({ end_date: null }, '2026-10-12')).toBe(false);
  });

  it('keeps current and upcoming trips in order, past ones latest first', () => {
    const { current, past } = splitTrips(trips, '2026-10-12');
    expect(current.map((t) => t.id)).toEqual(['a', 'c', 'e']);
    expect(past.map((t) => t.id)).toEqual(['b', 'd']);
    expect(pastTripsLabel(past.length)).toBe('Past trips (2)');
  });
});

describe('organiserId', () => {
  const members = [
    { id: 'm1', user_id: 'u1' },
    { id: 'm2', user_id: 'u2' },
  ];

  it('is the member trips.created_by points to', () => {
    expect(organiserId(members, 'u2')).toBe('m2');
  });

  it('falls back to the earliest joiner', () => {
    expect(organiserId(members, 'gone')).toBe('m1');
    expect(organiserId([], 'u1')).toBeNull();
  });
});
