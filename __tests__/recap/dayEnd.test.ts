import type { Spend } from '@/features/money/types';
import type { Stop } from '@/features/planning/types';
import {
  activeTripDay,
  addDayFor,
  closedCountLabel,
  closedIds,
  dayEndMode,
  dayFinished,
  dayFinishedFor,
  dayReview,
  keptGoingWindow,
  myClosedDays,
  NO_STOPS_START_HOUR,
  openDayEndsAt,
  sharingBackAt,
  shareNow,
} from '@/features/recap/dayEnd';
import { keptGoing, useKeepGoing } from '@/features/recap/keepGoing';
import type { DayClosure } from '@/features/recap/types';
import { sharingWindow } from '@/features/group/groupMap';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const at = (h: number, m = 0, day = 12) => new Date(2026, 9, day, h, m).toISOString();
const ms = (h: number, m = 0, day = 12) => Date.parse(at(h, m, day));

let n = 0;
function stop(name: string, from: string | null, to: string | null, extra: Partial<Stop> = {}): Stop {
  n += 1;
  return {
    id: `s${n}`,
    trip_id: 't1',
    day_number: 1,
    position: n,
    name,
    address: null,
    lat: 5.4,
    lng: 100.3,
    planned_time: from,
    planned_end: to,
    price: 0,
    is_estimate: false,
    is_booked: false,
    is_outdoor: false,
    tip: null,
    status: 'planned',
    arrived_at: null,
    left_at: null,
    actual_cost: null,
    category: null,
    priority: 1,
    note: null,
    place_id: null,
    ...extra,
  };
}

const spend = (stopId: string, amount: number, extra: Partial<Spend> = {}): Spend => ({
  id: `sp-${stopId}`,
  trip_id: 't1',
  stop_id: stopId,
  member_id: 'me',
  day_number: 1,
  amount,
  confirmed: false,
  skipped: false,
  note: null,
  answered_at: at(23),
  ...extra,
});

describe('when the end-of-day card shows', () => {
  const day = [
    stop('Kek Lok Si', at(11, 30), at(12, 30), { status: 'done' }),
    stop('Night market', at(19), at(22, 30)),
  ];

  it('not before the last stop is finished', () => {
    expect(dayFinished(day, ms(20))).toBe(false);
    expect(dayEndMode({ finished: false, keptGoing: false, closed: false })).toBe('hidden');
  });

  it('once the group has left the last stop (or tapped "We\'re done here" there)', () => {
    const left = [day[0], { ...day[1], status: 'done' as const, arrived_at: at(19), left_at: at(21) }];
    expect(dayFinished(left, ms(21))).toBe(true);
  });

  it('once the last stop\'s planned end has passed, even if they are still there or skipped it', () => {
    expect(dayFinished(day, ms(22, 29))).toBe(false);
    expect(dayFinished(day, ms(22, 30))).toBe(true);
    expect(dayFinished([{ ...day[1], status: 'arrived' }], ms(22, 30))).toBe(true);
  });

  it('a last stop without an end time counts as finished 60 min after it starts', () => {
    expect(dayFinished([stop('Bar', at(21), null)], ms(21, 59))).toBe(false);
    expect(dayFinished([stop('Bar', at(21), null)], ms(22))).toBe(true);
  });

  it('a stop added after it opens the day again until that one is finished', () => {
    const done = [{ ...day[1], status: 'done' as const }];
    expect(dayFinished([...done, stop('Late supper', at(23), at(23, 45))], ms(22, 40))).toBe(false);
  });

  it('no stops: nothing to finish', () => {
    expect(dayFinished([], ms(23))).toBe(false);
  });

  it('shows the card, or the pinned buttons after "Keep going", and "Day closed" after Done', () => {
    expect(dayEndMode({ finished: true, keptGoing: false, closed: false })).toBe('ask');
    expect(dayEndMode({ finished: true, keptGoing: true, closed: false })).toBe('keep-going');
    expect(dayEndMode({ finished: true, keptGoing: true, closed: true })).toBe('closed');
    // Kept going and stops added: back to Now / Next, nothing at the bottom.
    expect(dayEndMode({ finished: false, keptGoing: true, closed: false })).toBe('hidden');
  });
});

describe('Keep going', () => {
  it('is remembered per trip and day', () => {
    useKeepGoing.getState().keepGoing('t1', 1, ms(22));
    const tapped = useKeepGoing.getState().at;
    expect(keptGoing(tapped, 't1', 1, ms(22, 5))).toBe(true);
    expect(keptGoing(tapped, 't1', 2, ms(22, 5))).toBe(false);
    expect(keptGoing(tapped, 't2', 1, ms(22, 5))).toBe(false);
    expect(keptGoing(tapped, undefined, 1, ms(22, 5))).toBe(false);
  });

  it('is forgotten when the Demo clock goes back before the tap (Reset)', () => {
    const tapped = useKeepGoing.getState().at;
    expect(keptGoing(tapped, 't1', 1, ms(21))).toBe(false);
  });
});

describe('who has closed their day', () => {
  const row = (member: string, day: number, closedAt: string, closed = true): DayClosure => ({
    trip_id: 't1',
    member_id: member,
    day_number: day,
    closed,
    closed_at: closedAt,
  });
  const rows = [row('a', 1, at(22)), row('b', 1, at(22, 30), false), row('c', 1, at(23, 30)), row('d', 2, at(22))];

  it('counts closed rows for the day, not old reopened rows or ones after the (fake) time', () => {
    expect([...closedIds(rows, 1, ms(23))]).toEqual(['a']);
    expect([...closedIds(rows, 1, ms(23, 45))].sort()).toEqual(['a', 'c']);
    expect([...closedIds(rows, 2, ms(23))]).toEqual(['d']);
  });

  it('labels the count', () => {
    expect(closedCountLabel(2, 4)).toBe('2 of 4 have closed their day');
    expect(closedCountLabel(1, 1)).toBe("You've closed your day");
  });

  it("lists the days I've closed, so Demo Reset (clock back) undoes them", () => {
    const mine = [row('a', 1, at(22)), row('a', 2, at(22, 0, 13)), row('b', 3, at(22))];
    expect([...myClosedDays(mine, 'a', ms(23, 0, 13))].sort()).toEqual([1, 2]);
    expect([...myClosedDays(mine, 'a', ms(21))]).toEqual([]);
    expect([...myClosedDays(mine, null, ms(23, 0, 13))]).toEqual([]);
  });
});

describe('finished days are read-only', () => {
  const none = new Set<number>();

  it('finishes a day once I tap Done for today on it, for me only', () => {
    expect(dayFinishedFor({ day: 1, openDay: 1, closedDays: new Set([1]) })).toBe(true);
    // Someone else (no closure of their own) can still change Day 1 that evening.
    expect(dayFinishedFor({ day: 1, openDay: 1, closedDays: none })).toBe(false);
  });

  it('finishes it for everyone once the next trip day starts (the open-day rule)', () => {
    expect(dayFinishedFor({ day: 1, openDay: 2, closedDays: none })).toBe(true);
    expect(dayFinishedFor({ day: 2, openDay: 2, closedDays: none })).toBe(false);
    expect(dayFinishedFor({ day: 3, openDay: 2, closedDays: none })).toBe(false);
    // Kept going past midnight: still Day 1 for that person, so they can still add to it.
    expect(dayFinishedFor({ day: 1, openDay: 1, closedDays: none })).toBe(false);
    // Before the trip nothing is finished; after it (open day past the last) every day is.
    expect(dayFinishedFor({ day: 1, openDay: 0, closedDays: none })).toBe(false);
    expect(dayFinishedFor({ day: 3, openDay: 4, closedDays: none })).toBe(true);
  });

  it('adds a stop made now (Add to plan) to the open day, never a finished one', () => {
    expect(addDayFor({ openDay: 2, calendarDay: 2, days: 3, closedDays: none })).toBe(2);
    // Keep going past midnight: Day 1 is still open for me.
    expect(addDayFor({ openDay: 1, calendarDay: 2, days: 3, closedDays: none })).toBe(1);
    // Closed Day 1 after midnight: it goes on Day 2, the calendar day.
    expect(addDayFor({ openDay: 1, calendarDay: 2, days: 3, closedDays: new Set([1]) })).toBe(2);
    // Closed today in the evening, or not a trip day: nowhere.
    expect(addDayFor({ openDay: 2, calendarDay: 2, days: 3, closedDays: new Set([2]) })).toBeNull();
    expect(addDayFor({ openDay: 4, calendarDay: 4, days: 3, closedDays: none })).toBeNull();
    expect(addDayFor({ openDay: 0, calendarDay: -2, days: 3, closedDays: none })).toBeNull();
  });
});

describe('location sharing stop / start', () => {
  const day1 = [
    { planned_time: at(8), planned_end: at(9), status: 'done' as const },
    { planned_time: at(19), planned_end: at(22, 30), status: 'planned' as const },
  ];
  const window = sharingWindow(day1);

  it('starts 60 min before the first stop', () => {
    expect(shareNow(window, ms(6, 59), false)).toBe(false);
    expect(shareNow(window, ms(7), false)).toBe(true);
  });

  it('keeps going after the last stop until Done for today (no cut-off an hour later)', () => {
    expect(shareNow(window, ms(23, 45), false)).toBe(true);
    expect(window!.to).toBe(ms(0, 0, 13));
  });

  it('stops once this person closes the day', () => {
    expect(shareNow(window, ms(22, 40), true)).toBe(false);
  });

  it('starts again from 60 min before the next day\'s first stop', () => {
    const day2 = sharingWindow([{ planned_time: at(8, 0, 13), planned_end: at(10, 0, 13), status: 'planned' }]);
    expect(shareNow(day2, ms(6, 30, 13), false)).toBe(false);
    expect(shareNow(day2, ms(7, 0, 13), false)).toBe(true);
    expect(sharingBackAt([{ planned_time: at(8, 0, 13) }, { planned_time: at(11, 0, 13) }])).toBe('07:00');
    expect(sharingBackAt([{ planned_time: null }])).toBeNull();
  });

  it('runs past midnight when the last stop does', () => {
    const late = sharingWindow([{ planned_time: at(22), planned_end: at(23, 30), status: 'planned' }]);
    expect(late!.to).toBe(ms(0, 30, 13));
  });
});

describe('"Keep going" keeps the day open past midnight', () => {
  // Day 1 is 12 Oct; Day 2 (13 Oct) starts at 08:00, so its sharing starts at 07:00.
  const day2 = [{ planned_time: at(8, 0, 13) }, { planned_time: at(11, 0, 13) }];
  const endsAt = openDayEndsAt(day2, '2026-10-13');
  const day1Window = sharingWindow([{ planned_time: at(19), planned_end: at(22, 30), status: 'done' }]);

  it("ends by itself 1 hour before the next day's first stop", () => {
    expect(endsAt).toBe(ms(7, 0, 13));
    // A next day with nothing timed: as if it started at 09:00.
    expect(openDayEndsAt([], '2026-10-13')).toBe(ms(NO_STOPS_START_HOUR - 1, 0, 13));
  });

  it('the Today tab stays on Day 1 after midnight until then, only after Keep going', () => {
    const on = (t: number, kept: boolean) => activeTripDay({ calendarDay: 2, prevKeptGoing: kept, prevEndsAt: endsAt, t });
    expect(on(ms(0, 30, 13), true)).toBe(1);
    expect(on(ms(6, 59, 13), true)).toBe(1);
    expect(on(ms(7, 0, 13), true)).toBe(2);
    // Without Keep going: the current behaviour, the day ends at midnight.
    expect(on(ms(0, 30, 13), false)).toBe(2);
    // Nothing before Day 1.
    expect(activeTripDay({ calendarDay: 1, prevKeptGoing: true, prevEndsAt: endsAt, t: ms(0, 30, 12) })).toBe(1);
  });

  it('works out Keep going for the day before from the saved tap', () => {
    useKeepGoing.getState().keepGoing('trip-k', 1, ms(22, 45));
    const kept = keptGoing(useKeepGoing.getState().at, 'trip-k', 1, ms(1, 0, 13));
    expect(activeTripDay({ calendarDay: 2, prevKeptGoing: kept, prevEndsAt: endsAt, t: ms(1, 0, 13) })).toBe(1);
  });

  it('location sharing keeps running past midnight until Done for today or the auto end', () => {
    const kept = keptGoingWindow(day1Window, true, endsAt);
    expect(shareNow(kept, ms(1, 30, 13), false)).toBe(true);
    expect(shareNow(kept, ms(6, 59, 13), false)).toBe(true);
    expect(shareNow(kept, ms(7, 1, 13), false)).toBe(false);
    // Done for today stops it straight away.
    expect(shareNow(kept, ms(1, 30, 13), true)).toBe(false);
  });

  it('without Keep going sharing still stops at midnight', () => {
    const plain = keptGoingWindow(day1Window, false, endsAt);
    expect(plain).toEqual(day1Window);
    expect(shareNow(plain, ms(23, 59), false)).toBe(true);
    expect(shareNow(plain, ms(0, 1, 13), false)).toBe(false);
  });
});

describe('How today went: planned vs actual', () => {
  const flight = stop('Flight KUL → PEN', at(6, 50), at(7, 50), {
    status: 'done',
    arrived_at: at(6, 52),
    left_at: at(7, 50),
    price: 120,
    is_booked: true,
    category: 'flight',
  });
  const hill = stop('Penang Hill funicular', at(9, 30), at(11), {
    status: 'done',
    arrived_at: at(10, 30),
    left_at: at(11, 20),
    price: 15,
  });
  const temple = stop('Kek Lok Si Temple', at(11, 30), at(12, 30), {
    status: 'done',
    arrived_at: at(12, 5),
    left_at: at(12, 50),
    price: 16,
    is_estimate: true,
  });
  const food = stop('Chulia Street street food', at(14), at(15), {
    status: 'done',
    arrived_at: at(14, 2),
    left_at: at(16, 10),
    price: 20,
    is_estimate: true,
  });
  const skipped = stop('Clan Jetties', at(17), at(18), { price: 0 });
  const dropped = stop('Batik workshop', at(16), at(17), { status: 'dropped', price: 40 });
  const review = dayReview([food, skipped, dropped, temple, flight, hill], new Map([[temple.id, spend(temple.id, 18)]]));
  const row = (name: string) => review.rows.find((r) => r.name === name)!;

  it('lists every stop in time order, dropped ones too', () => {
    expect(review.rows.map((r) => r.name)).toEqual([
      'Flight KUL → PEN',
      'Penang Hill funicular',
      'Kek Lok Si Temple',
      'Chulia Street street food',
      'Batik workshop',
      'Clan Jetties',
    ]);
    expect(review.visited).toBe(4);
    expect(review.total).toBe(6);
  });

  it('puts the planned time and price next to the arrived time and final spend', () => {
    expect(row('Kek Lok Si Temple')).toMatchObject({
      mark: 'late',
      struck: false,
      planned: 'Planned 11:30 · ~RM 16',
      actual: '12:05 – 12:50',
      late: '35 min late',
      spent: 'RM 18',
    });
    expect(row('Chulia Street street food')).toMatchObject({ mark: 'done', late: null, actual: '14:02 – 16:10', spent: '~RM 20' });
    expect(row('Penang Hill funicular')).toMatchObject({ mark: 'late', late: '1 h late', spent: 'RM 15' });
    expect(row('Flight KUL → PEN')).toMatchObject({ mark: 'done', planned: 'Planned 06:50 · RM 120', spent: 'RM 120' });
  });

  it('crosses out skipped and dropped stops', () => {
    expect(row('Clan Jetties')).toMatchObject({ mark: 'missed', struck: true, actual: 'Skipped', spent: null });
    expect(row('Batik workshop')).toMatchObject({ mark: 'missed', struck: true, actual: 'Dropped', spent: null });
  });

  it('totals the plan (dropped left out) and what was spent at the stops visited', () => {
    // 120 + 15 + 16 + 20 + 0 planned; 120 + 15 + 18 + ~20 spent.
    expect(review.planned).toBe('~RM 171');
    expect(review.spent).toBe('~RM 173');
  });

  it('a skipped spend check keeps the guess; an answered one is exact', () => {
    const r = dayReview([temple], new Map([[temple.id, spend(temple.id, 16, { skipped: true })]]));
    expect(r.rows[0].spent).toBe('~RM 16');
    expect(dayReview([hill], new Map()).spent).toBe('RM 15');
  });
});
