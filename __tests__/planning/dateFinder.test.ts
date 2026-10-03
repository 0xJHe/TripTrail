import { findBestWindow, freeLabel } from '@/features/planning/dateFinder';
import { rangeDates } from '@/features/planning/dates';

const aisha = { memberId: 'a', freeDates: rangeDates('2026-10-11', '2026-10-14') };
const ravi = { memberId: 'r', freeDates: rangeDates('2026-10-12', '2026-10-20') };
const mei = { memberId: 'm', freeDates: rangeDates('2026-10-12', '2026-10-14') };
const dan = { memberId: 'd', freeDates: [...rangeDates('2026-10-12', '2026-10-14'), ...rangeDates('2026-10-18', '2026-10-20')] };

describe('findBestWindow', () => {
  it('finds the days everyone is free', () => {
    const w = findBestWindow([aisha, ravi, mei, dan], 4, 3);
    expect(w).toMatchObject({ start: '2026-10-12', end: '2026-10-14', freeCount: 4, total: 4 });
    expect(freeLabel(w!)).toBe('all 4 of you are free');
  });

  it('falls back to the window most people can make', () => {
    const w = findBestWindow([aisha, ravi, mei, dan], 4, 4);
    expect(w).toMatchObject({ start: '2026-10-11', end: '2026-10-14', freeCount: 1 });
    const later = findBestWindow([ravi, dan], 4, 3);
    expect(later).toMatchObject({ start: '2026-10-12', freeCount: 2 });
    expect(freeLabel(later!)).toBe('only 2 of 4 free');
  });

  it('counts members who have not answered as not free', () => {
    const w = findBestWindow([aisha], 3, 2);
    expect(w).toMatchObject({ freeCount: 1, total: 3 });
  });

  it('stays inside fixed trip dates', () => {
    const w = findBestWindow([ravi, dan], 2, 3, { start: '2026-10-18', end: '2026-10-20' });
    expect(w).toMatchObject({ start: '2026-10-18', end: '2026-10-20', freeCount: 2 });
  });

  it('returns null when nobody is free long enough', () => {
    expect(findBestWindow([mei], 1, 5)).toBeNull();
    expect(findBestWindow([], 2, 2)).toBeNull();
  });

  it('talks to a solo traveller directly', () => {
    expect(freeLabel(findBestWindow([aisha], 1, 3)!)).toBe("you're free");
  });
});
