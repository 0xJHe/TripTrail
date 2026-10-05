// The simple-rules new day on the running-late card (no AI).
import { NOTES, remainingFrom, ruleBasedNewDay, type PlanStop, type StopRow } from '@/supabase/functions/_shared/replan';

const MIN = 60_000;
const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).getTime();
const clock = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const DAY_END = at(22);

let n = 0;
function stop(name: string, from: number, to: number | null, extra: Partial<PlanStop> = {}): PlanStop {
  n += 1;
  return { id: `s${n}`, name, start: from, end: to, price: 0, fixed: false, priority: 2, category: 'sight', outdoor: false, ...extra };
}

/** "10:30 Penang Hill funicular · next slot" lines, to compare whole days at once. */
const lines = (stops: PlanStop[], arriveAt: number) =>
  ruleBasedNewDay({ stops, arriveAt, dayEndsAt: DAY_END }).items.map((i) =>
    [i.dropped ? 'Drop' : clock(i.start), i.name, i.note].filter(Boolean).join(' · '),
  );

describe('ruleBasedNewDay', () => {
  const funicular = stop('Penang Hill funicular', at(9, 30), at(11), { price: 15 });
  const kekLokSi = stop('Kek Lok Si Temple', at(11, 30), at(13, 30));
  const chulia = stop('Chulia Street street food', at(14, 30), at(15, 30), { fixed: true, category: 'food', price: 16 });
  const jetties = stop('Clan Jetties', at(16), at(17, 30), { priority: 1, price: 12 });
  const market = stop('Batu Ferringhi night market', at(19), at(21, 30), { category: 'shopping', price: 20 });
  const day = [funicular, kekLokSi, chulia, jetties, market];

  it('moves the late stop to when the group gets there and shortens the next stop (screen 7)', () => {
    expect(lines(day, at(10, 28))).toEqual([
      '10:30 · Penang Hill funicular · next slot',
      '12:00 · Kek Lok Si Temple · shortened',
      '14:30 · Chulia Street street food',
      '16:00 · Clan Jetties',
      '19:00 · Batu Ferringhi night market',
    ]);
    const plan = ruleBasedNewDay({ stops: day, arriveAt: at(10, 28), dayEndsAt: DAY_END });
    expect(plan.source).toBe('rules');
    expect(plan.costChange).toBe(0);
    // Shortened = starts later, same end.
    expect(clock(plan.items[1].end)).toBe('13:30');
    expect(clock(plan.items[0].end)).toBe('12:00'); // the late stop keeps its 90 minutes
  });

  it('rounds the new start up to the next 5 minutes', () => {
    expect(lines([funicular, kekLokSi], at(9, 41))[0]).toBe('09:45 · Penang Hill funicular · next slot');
  });

  it('passes the delay on when a stop has no spare time ("moved"); free time before a meal absorbs it', () => {
    const a = stop('Armenian Street murals', at(10), at(11));
    const b = stop('Blue Mansion tour', at(11), at(11, 30)); // 30 min: nothing to spare
    const lunch = stop('Nasi kandar lunch', at(12, 30), at(13, 30), { fixed: true, category: 'food' });
    expect(lines([a, b, lunch], at(10, 20))).toEqual([
      '10:20 · Armenian Street murals · next slot',
      '11:20 · Blue Mansion tour · moved',
      '12:30 · Nasi kandar lunch',
    ]);
  });

  it('never moves meals: the stop before gives up its time instead', () => {
    const sight = stop('Fort Cornwallis', at(12), at(13));
    const lunch = stop('Lunch at Kapitan', at(13), at(14), { fixed: true, category: 'food', price: 15 });
    const plan = ruleBasedNewDay({ stops: [sight, lunch], arriveAt: at(12, 40), dayEndsAt: DAY_END });
    expect(plan.items.map((i) => [clock(i.start), clock(i.end), i.note])).toEqual([
      ['12:40', '13:00', NOTES.nextSlot],
      ['13:00', '14:00', null],
    ]);
  });

  it('drops the stop before a meal when less than 15 minutes would be left of it', () => {
    const sight = stop('Fort Cornwallis', at(12), at(13), { price: 20 });
    const lunch = stop('Lunch at Kapitan', at(13), at(14), { fixed: true, category: 'food' });
    expect(lines([sight, lunch], at(12, 50))).toEqual(['13:00 · Lunch at Kapitan', 'Drop · Fort Cornwallis · no time left']);
    expect(ruleBasedNewDay({ stops: [sight, lunch], arriveAt: at(12, 50), dayEndsAt: DAY_END }).costChange).toBe(-20);
  });

  it('never moves booked stops, even when they are the late one', () => {
    const flight = stop('Flight to KL', at(10), at(11), { fixed: true, category: 'flight' });
    const after = stop('KLCC park', at(13), at(14));
    expect(lines([flight, after], at(10, 30))).toEqual(['10:00 · Flight to KL · fixed time', '13:00 · KLCC park']);
  });

  it('drops the lowest-priority stop when the day would end after 22:00', () => {
    const sunset = stop('Sunset at the Esplanade', at(19), at(20, 30));
    const market = stop('Night market', at(20, 30), at(21, 30), { category: 'shopping', price: 20 });
    const walk = stop('Clan Jetties at night', at(21, 30), at(22), { priority: 1, price: 12 });
    expect(lines([sunset, market, walk], at(20))).toEqual([
      '20:00 · Sunset at the Esplanade · next slot',
      '21:30 · Night market · shortened',
      'Drop · Clan Jetties at night · lowest priority',
    ]);
    const plan = ruleBasedNewDay({ stops: [sunset, market, walk], arriveAt: at(20), dayEndsAt: DAY_END });
    expect(plan.costChange).toBe(-12);
    expect(clock(plan.endsAt)).toBe('22:00');
  });

  it('drops the later stop when priorities tie, and never the late stop or meals', () => {
    const late = stop('Penang Hill', at(18), at(20), { priority: 1 });
    const dinner = stop('Dinner', at(20, 30), at(21, 30), { fixed: true, category: 'food' });
    const a = stop('Night walk', at(21, 30), at(22));
    const b = stop('Dessert stop', at(21, 45), at(22));
    const plan = ruleBasedNewDay({ stops: [late, dinner, a, b], arriveAt: at(19, 30), dayEndsAt: at(21, 50) });
    expect(plan.items.filter((i) => i.dropped).map((i) => i.name)).toEqual(['Night walk', 'Dessert stop']);
    expect(plan.items.find((i) => i.name === 'Penang Hill')!.dropped).toBe(false);
    expect(plan.items.find((i) => i.name === 'Dinner')!.dropped).toBe(false);
  });

  it('keeps an end time empty when the stop had none', () => {
    const open = stop('Gurney Plaza', at(15), null);
    const next = stop('Gurney Drive hawkers', at(19), null, { fixed: true, category: 'food' });
    const plan = ruleBasedNewDay({ stops: [open, next], arriveAt: at(15, 20), dayEndsAt: DAY_END });
    expect(plan.items[0]).toMatchObject({ name: 'Gurney Plaza', end: null, note: NOTES.nextSlot });
    expect(clock(plan.items[0].start)).toBe('15:20');
  });

  it('changes nothing when there is nothing to change', () => {
    expect(ruleBasedNewDay({ stops: [], arriveAt: at(10), dayEndsAt: DAY_END })).toEqual({
      source: 'rules',
      items: [],
      costChange: 0,
      endsAt: null,
    });
  });
});

describe('remainingFrom', () => {
  const row = (id: string, h: number, extra: Partial<StopRow> = {}): StopRow => ({
    id,
    name: id,
    planned_time: new Date(at(h)).toISOString(),
    planned_end: new Date(at(h) + 60 * MIN).toISOString(),
    price: '15',
    is_booked: false,
    is_outdoor: true,
    category: 'sight',
    priority: null,
    status: 'planned',
    ...extra,
  });

  it('takes the planned stops from the late one on, in time order, and marks meals and bookings fixed', () => {
    const rows = [
      row('hotel', 8, { is_booked: true, category: 'hotel', status: 'arrived' }),
      row('lunch', 12, { category: 'food' }),
      row('late', 10),
      row('skipped', 9),
      row('gone', 11, { status: 'dropped' }),
      row('flight', 18, { is_booked: true, category: 'flight' }),
    ];
    const out = remainingFrom(rows, 'late');
    expect(out.map((s) => [s.id, s.fixed])).toEqual([
      ['late', false],
      ['lunch', true],
      ['flight', true],
    ]);
    expect(out[0]).toMatchObject({ price: 15, priority: 2, outdoor: true });
    expect(remainingFrom(rows, 'nope')).toEqual([]);
  });
});
