import { checkOverlap, overlapText } from '@/features/planning/overlap';
import { clockOf } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';

const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).toISOString();

type S = Pick<Stop, 'id' | 'name' | 'day_number' | 'planned_time' | 'planned_end' | 'is_booked' | 'status'>;

function stop(id: string, from: [number, number], to: [number, number] | null, extra: Partial<S> = {}): S {
  return {
    id,
    name: id,
    day_number: 1,
    planned_time: at(...from),
    planned_end: to ? at(...to) : null,
    is_booked: false,
    status: 'planned',
    ...extra,
  };
}

const times = (from: [number, number], to: [number, number], extra: { id?: string; day_number?: number } = {}) => ({
  day_number: 1,
  planned_time: at(...from),
  planned_end: at(...to),
  ...extra,
});

const plan = [
  stop('Temple', [9, 0], [10, 30]),
  stop('Lunch', [11, 0], [12, 0]),
  stop('Museum', [13, 0], [14, 30]),
  stop('Dinner', [19, 0], [20, 0]),
];

describe('checkOverlap', () => {
  it('is fine when the times touch but do not overlap', () => {
    expect(checkOverlap(times([10, 30], [11, 0]), plan)).toEqual({ ok: true });
  });

  it('names the first stop it overlaps', () => {
    const c = checkOverlap(times([10, 0], [11, 30]), plan);
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.with.id).toBe('Temple');
    expect(overlapText(c.with, clockOf)).toBe('This overlaps with Temple (09:00–10:30).');
  });

  it('moves the overlapping stop and later ones just enough, keeping their lengths; gaps soak it up', () => {
    // New stop 10:45–12:30: Lunch 11:00 -> 12:30–13:30, Museum 13:00 -> 13:30–15:00, Dinner untouched.
    const c = checkOverlap(times([10, 45], [12, 30]), plan);
    if (c.ok) throw new Error('expected an overlap');
    expect(c.with.id).toBe('Lunch');
    expect(c.reason).toBeNull();
    expect(c.moves).toEqual([
      { id: 'Lunch', planned_time: at(12, 30), planned_end: at(13, 30) },
      { id: 'Museum', planned_time: at(13, 30), planned_end: at(15, 0) },
    ]);
  });

  it('moves a stop that started before the new one to after it', () => {
    const c = checkOverlap(times([9, 30], [10, 0]), plan);
    if (c.ok) throw new Error('expected an overlap');
    expect(c.moves).toEqual([
      { id: 'Temple', planned_time: at(10, 0), planned_end: at(11, 30) },
      { id: 'Lunch', planned_time: at(11, 30), planned_end: at(12, 30) },
    ]);
  });

  it('ignores the stop being edited, other days, dropped and untimed stops', () => {
    const others = [
      stop('Other day', [10, 0], [11, 0], { day_number: 2 }),
      stop('Dropped', [10, 0], [11, 0], { status: 'dropped' }),
      { ...stop('Untimed', [10, 0], null), planned_time: null },
    ];
    expect(checkOverlap(times([9, 30], [10, 0], { id: 'Temple' }), [...plan, ...others])).toEqual({ ok: true });
  });

  it("counts group B's own stops in this person's view like any other", () => {
    const view = [...plan, stop('Group B cafe', [15, 0], [16, 0], { split_id: 's1' } as Partial<S>)];
    const c = checkOverlap(times([15, 30], [16, 30]), view);
    expect(!c.ok && c.with.id).toBe('Group B cafe');
  });

  it('a stop with no end time overlaps when it starts inside the new times', () => {
    const c = checkOverlap(times([16, 0], [17, 0]), [stop('Sunset', [16, 30], null)]);
    if (c.ok) throw new Error('expected an overlap');
    expect(c.moves).toEqual([{ id: 'Sunset', planned_time: at(17, 0), planned_end: null }]);
  });

  it('never moves booked stops', () => {
    const hotel = stop('Hotel check-in', [15, 0], [15, 30], { is_booked: true });
    const direct = checkOverlap(times([15, 0], [16, 0]), [...plan, hotel]);
    expect(direct).toMatchObject({ ok: false, moves: null, reason: 'booked' });
    // Museum would have to move into the hotel check-in.
    const pushed = checkOverlap(times([13, 0], [14, 0]), [...plan, hotel]);
    expect(pushed).toMatchObject({ ok: false, moves: null, reason: 'booked' });
    // A booked stop with room around it stays where it is.
    const roomy = checkOverlap(times([13, 0], [13, 15]), [...plan, hotel]);
    expect(!roomy.ok && roomy.moves?.map((m) => m.id)).toEqual(['Museum']);
  });

  it("offers no shift when a stop would run past midnight", () => {
    const late = [stop('Night market', [21, 0], [23, 30])];
    expect(checkOverlap(times([21, 0], [22, 0]), late)).toMatchObject({ ok: false, moves: null, reason: 'midnight' });
    // Just fits: 22:00–23:59 isn't past midnight.
    const fits = checkOverlap(times([21, 0], [22, 0]), [stop('Night market', [21, 30], [23, 29])]);
    expect(fits).toMatchObject({ ok: false, reason: null, moves: [{ id: 'Night market', planned_time: at(22, 0), planned_end: at(23, 59) }] });
  });
});
