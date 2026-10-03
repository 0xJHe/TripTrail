import {
  addDays,
  addMonths,
  daysBetween,
  formatRange,
  monthLabel,
  rangeDates,
  summarizeDates,
  weekdayMon0,
} from '@/features/planning/dates';

describe('dates', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-10-12', '2026-10-14')).toBe(2);
  });

  it('moves between months', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthLabel('2026-10')).toBe('October 2026');
  });

  it('knows 1 Oct 2026 is a Thursday', () => {
    expect(weekdayMon0('2026-10-01')).toBe(3);
  });

  it('formats ranges like the prototype', () => {
    expect(formatRange('2026-10-12', '2026-10-14')).toBe('12 – 14 Oct');
    expect(formatRange('2026-10-30', '2026-11-02')).toBe('30 Oct – 2 Nov');
    expect(formatRange('2026-10-12', '2026-10-12')).toBe('12 Oct');
  });

  it('summarises picked days', () => {
    expect(summarizeDates(rangeDates('2026-10-11', '2026-10-14'))).toBe('11 – 14 Oct');
    expect(summarizeDates(['2026-10-20', '2026-10-11', '2026-10-12'])).toBe('11 – 12 Oct, 20 Oct');
    expect(summarizeDates(['2026-10-01', '2026-10-03', '2026-10-05'])).toBe('1 Oct, 3 Oct +1 more');
  });
});
