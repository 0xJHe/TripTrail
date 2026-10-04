import { emptyForm, readStopForm } from '@/features/planning/stopForm';
import { atClock, clockOf, dayCount, draftsToStops, parseClock, priceLabel, sortStops, timeLabel } from '@/features/planning/stops';
import { generateItinerary, sampleItinerary } from '@/lib/ai';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('times', () => {
  it('reads times the way people type them', () => {
    expect(parseClock('09:30')).toBe(570);
    expect(parseClock('9:30')).toBe(570);
    expect(parseClock('19.00')).toBe(1140);
    expect(parseClock('930')).toBe(570);
    expect(parseClock('7')).toBe(420);
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock('soon')).toBeNull();
  });

  it('round-trips a stop time on the phone clock', () => {
    const iso = atClock('2026-10-12', '06:50')!;
    expect(clockOf(iso)).toBe('06:50');
    expect(timeLabel({ planned_time: iso, planned_end: atClock('2026-10-12', '7:50') })).toBe('06:50 – 07:50');
    expect(timeLabel({ planned_time: iso, planned_end: null })).toBe('06:50');
  });

  it('shows estimates with ~', () => {
    expect(priceLabel({ price: 16, is_estimate: true })).toBe('~RM 16');
    expect(priceLabel({ price: 15, is_estimate: false })).toBe('RM 15');
  });
});

describe('plan from the sample itinerary', () => {
  const drafts = sampleItinerary({ destination: 'Penang', days: 3, dayTitles: [], halal: true });

  it('has stops on every day with a time and price', () => {
    expect(new Set(drafts.map((d) => d.day))).toEqual(new Set([1, 2, 3]));
    for (const d of drafts) {
      expect(parseClock(d.time)).not.toBeNull();
      expect(d.price).toBeGreaterThanOrEqual(0);
    }
  });

  it('is what generateItinerary returns for now', async () => {
    const result = await generateItinerary({ destination: 'Penang', days: 3, dayTitles: [], halal: true });
    expect(result).toEqual({ stops: drafts, source: 'sample' });
  });

  it('dates each day from the trip start and numbers positions per day', () => {
    const rows = draftsToStops(drafts, '2026-10-12');
    const day2 = rows.filter((r) => r.day_number === 2);
    expect(day2[0].position).toBe(0);
    expect(new Date(day2[0].planned_time!).getDate()).toBe(13);
  });

  it('makes a plan for places without seed stops from the day titles', () => {
    const plan = sampleItinerary({ destination: 'Melaka', days: 2, dayTitles: ['Jonker Walk & Red Square', 'River cruise'], halal: true });
    expect(plan.filter((s) => s.day === 1).map((s) => s.name)).toContain('Red Square');
    expect(plan.some((s) => /halal/.test(s.name))).toBe(true);
  });
});

describe('sortStops', () => {
  const s = (id: string, day: number, time: string | null, position: number, status: 'planned' | 'dropped' = 'planned') => ({
    id,
    day_number: day,
    planned_time: time ? atClock('2026-10-12', time) : null,
    position,
    status,
  });

  it('orders by day, then time, untimed last, and hides deleted stops', () => {
    const sorted = sortStops([
      s('c', 2, '08:00', 0),
      s('b', 1, '14:00', 0),
      s('x', 1, '09:00', 2, 'dropped'),
      s('u', 1, null, 1),
      s('a', 1, '09:00', 3),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['a', 'b', 'u', 'c']);
  });

  it('has a tab for every trip day and any later day with stops', () => {
    expect(dayCount([], 3)).toBe(3);
    expect(dayCount([{ day_number: 4 }], 3)).toBe(4);
    expect(dayCount([], null)).toBe(1);
  });
});

describe('stop form', () => {
  const form = { ...emptyForm(2), name: 'Flight KUL → PEN', kind: 'flight' as const, time: '6:50', endTime: '7:50', price: 'RM 89' };

  it('marks flights and hotels as booked with a real price', () => {
    const read = readStopForm({ ...form, estimate: true }, '2026-10-12');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.fields).toMatchObject({ day_number: 2, is_booked: true, is_estimate: false, category: 'flight', price: 89 });
    expect(new Date(read.fields.planned_time!).getDate()).toBe(13);
  });

  it('keeps a guessed price as an estimate for places', () => {
    const read = readStopForm({ ...form, kind: 'place', name: 'Chulia Street', price: '~16', estimate: true }, '2026-10-12', 'food');
    expect(read.ok && read.fields).toMatchObject({ is_booked: false, is_estimate: true, category: 'food', price: 16 });
  });

  it('says what is wrong in plain words', () => {
    expect(readStopForm({ ...form, name: ' ' }, '2026-10-12')).toEqual({ ok: false, error: 'Give the stop a name.' });
    expect(readStopForm({ ...form, time: 'noon' }, '2026-10-12')).toEqual({ ok: false, error: 'Time should look like 09:30.' });
    expect(readStopForm({ ...form, endTime: '05:00' }, '2026-10-12')).toEqual({ ok: false, error: 'End time is before the start time.' });
    expect(readStopForm({ ...form, price: 'abc' }, '2026-10-12')).toEqual({ ok: false, error: 'Price should be a number, like 16.' });
  });
});
