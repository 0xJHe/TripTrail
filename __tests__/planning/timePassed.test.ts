// A stop can't be added (or moved) to a start time that has already passed (now(), so the
// demo clock in Demo mode). Every way of adding a stop saves through useStopForm, which
// uses this rule. No Supabase calls.
import { emptyForm, readStopForm, TIME_PASSED, timePassedProblem } from '@/features/planning/stopForm';

const START = '2026-10-12'; // Day 1
const at = (day: number, h: number, m = 0) => new Date(2026, 9, 11 + day, h, m).getTime();
/** planned_time as the form saves it for day / time. */
const startOf = (day: number, time: string, end = '23:00') => {
  const read = readStopForm({ ...emptyForm(day), name: 'Kopi stop', time, endTime: end }, START);
  if (!read.ok) throw new Error(read.error);
  return read.fields.planned_time!;
};

describe('timePassedProblem', () => {
  const now = at(1, 11); // Day 1, 11:00

  it("refuses a new stop today at a time that has passed (it's 11:00, 05:00)", () => {
    expect(timePassedProblem(startOf(1, '05:00'), now)).toBe(TIME_PASSED);
    expect(TIME_PASSED).toBe('That time has already passed. Please pick a later time.');
  });

  it('needs a start later than now (11:00 itself is too late)', () => {
    expect(timePassedProblem(startOf(1, '11:00'), now)).toBe(TIME_PASSED);
    expect(timePassedProblem(startOf(1, '11:15'), now)).toBeNull();
  });

  it('puts no limit on future days', () => {
    expect(timePassedProblem(startOf(2, '05:00'), now)).toBeNull();
  });

  it('lets an edit of a stop that already started keep its time (price, name, end...)', () => {
    const started = startOf(1, '09:00');
    expect(timePassedProblem(started, now, started)).toBeNull();
    // Same moment written another way still counts as unchanged.
    expect(timePassedProblem(started, now, new Date(Date.parse(started)).toISOString())).toBeNull();
  });

  it('checks an edit that changes the start time', () => {
    expect(timePassedProblem(startOf(1, '08:00'), now, startOf(1, '09:00'))).toBe(TIME_PASSED);
    expect(timePassedProblem(startOf(1, '12:00'), now, startOf(1, '09:00'))).toBeNull();
    // A stop with no time yet getting a time that has passed.
    expect(timePassedProblem(startOf(1, '06:00'), now, null)).toBe(TIME_PASSED);
  });

  it('follows the clock it is given (Demo mode: the fake time)', () => {
    const fake = at(1, 4); // demo clock at 04:00
    expect(timePassedProblem(startOf(1, '05:00'), fake)).toBeNull();
  });

  it('a day kept open past midnight (Keep going): its times are all behind the clock', () => {
    const afterMidnight = at(2, 0, 30); // still Day 1, kept open
    expect(timePassedProblem(startOf(1, '22:00'), afterMidnight)).toBe(TIME_PASSED);
  });
});
