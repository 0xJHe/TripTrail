// The suggested new day on the running-late card (simple rules, no AI).
import { NOTES, remainingFrom, ruleBasedNewDay, type PlanStop, type StopRow } from '@/supabase/functions/_shared/newDay';

const MIN = 60_000;
const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).getTime();
const clock = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

let n = 0;
function stop(name: string, from: number, to: number | null, extra: Partial<PlanStop> = {}): PlanStop {
  n += 1;
  return { id: `s${n}`, name, start: from, end: to, price: 0, fixed: false, priority: 2, category: 'sight', outdoor: false, ...extra };
}
const meal = { category: 'food' };
const booked = { fixed: true, category: 'hotel' };

/** "10:30 · Penang Hill funicular · next slot" lines, to compare whole days at once. */
const lines = (stops: PlanStop[], arriveAt: number) =>
  ruleBasedNewDay({ stops, arriveAt }).items.map((i) => [i.dropped ? 'Drop' : clock(i.start), i.name, i.note].filter(Boolean).join(' · '));

describe('ruleBasedNewDay', () => {
  const funicular = stop('Penang Hill funicular', at(9, 30), at(11), { price: 15 });
  const kekLokSi = stop('Kek Lok Si Temple', at(11, 30), at(13, 30));
  const chulia = stop('Chulia Street street food', at(14, 30), at(15, 30), { ...meal, price: 16 });
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
    const plan = ruleBasedNewDay({ stops: day, arriveAt: at(10, 28) });
    expect(plan.costChange).toBe(0);
    expect(clock(plan.items[1].end)).toBe('13:30'); // shortened = starts later, same end
    expect(clock(plan.items[0].end)).toBe('12:00'); // the late stop keeps its 90 minutes
  });

  it('rounds the new start up to the next 5 minutes', () => {
    expect(lines([funicular, kekLokSi], at(9, 41))[0]).toBe('09:45 · Penang Hill funicular · next slot');
  });

  it('moves the late stop even when it is a meal, and shifts the stops after it', () => {
    const lunch = stop('Nasi kandar lunch', at(12, 30), at(13, 30), meal);
    const tour = stop('Blue Mansion tour', at(13, 30), at(14)); // 30 min: nothing to spare
    expect(lines([lunch, tour], at(12, 52))).toEqual(['12:55 · Nasi kandar lunch · next slot', '13:55 · Blue Mansion tour · moved']);
  });

  it('shortens a meal after the late stop when it has spare time', () => {
    const sight = stop('Fort Cornwallis', at(12), at(13));
    const lunch = stop('Lunch at Kapitan', at(13), at(14), meal);
    const plan = ruleBasedNewDay({ stops: [sight, lunch], arriveAt: at(12, 40) });
    expect(plan.items.map((i) => [clock(i.start), clock(i.end), i.note])).toEqual([
      ['12:40', '13:40', NOTES.nextSlot],
      ['13:40', '14:10', NOTES.shortened],
    ]);
  });

  it('passes the delay on when a stop has no spare time ("moved"); free time before the next stop absorbs it', () => {
    const a = stop('Armenian Street murals', at(10), at(11));
    const b = stop('Blue Mansion tour', at(11), at(11, 30));
    const lunch = stop('Nasi kandar lunch', at(12, 30), at(13, 30), meal);
    expect(lines([a, b, lunch], at(10, 20))).toEqual([
      '10:20 · Armenian Street murals · next slot',
      '11:20 · Blue Mansion tour · moved',
      '12:30 · Nasi kandar lunch',
    ]);
  });

  it('never moves booked stops: the stop before gives up its time instead', () => {
    const sight = stop('Gurney Plaza', at(17), at(18));
    const hotel = stop('Hotel check-in', at(18), at(18, 30), booked);
    expect(lines([sight, hotel], at(17, 40))).toEqual(['17:40 · Gurney Plaza · next slot', '18:00 · Hotel check-in']);
    expect(clock(ruleBasedNewDay({ stops: [sight, hotel], arriveAt: at(17, 40) }).items[0].end)).toBe('18:00');
  });

  it('drops the stop before a booked one when less than 15 minutes would be left of it', () => {
    const sight = stop('Gurney Plaza', at(17), at(18), { price: 20 });
    const hotel = stop('Hotel check-in', at(18), at(18, 30), booked);
    expect(lines([sight, hotel], at(17, 50))).toEqual(['18:00 · Hotel check-in', 'Drop · Gurney Plaza · no time left']);
    expect(ruleBasedNewDay({ stops: [sight, hotel], arriveAt: at(17, 50) }).costChange).toBe(-20);
  });

  it('keeps a booked late stop at its time', () => {
    const flight = stop('Flight to KL', at(10), at(11), { fixed: true, category: 'flight' });
    const after = stop('KLCC park', at(13), at(14));
    expect(lines([flight, after], at(10, 30))).toEqual(['10:00 · Flight to KL · fixed time', '13:00 · KLCC park']);
  });

  describe('dropping', () => {
    const sunset = stop('Sunset at the Esplanade', at(19), at(20, 30));
    const market2 = stop('Night market', at(20, 30), at(21, 30), { category: 'shopping', price: 20 });
    const walk = stop('Clan Jetties at night', at(21, 30), at(22), { priority: 1, price: 12 }); // plan ends 22:00

    it('keeps every stop while the day ends at most 30 min after the original plan', () => {
      const plan = ruleBasedNewDay({ stops: [sunset, market2, walk], arriveAt: at(20) });
      expect(plan.items.every((i) => !i.dropped)).toBe(true);
      expect(clock(plan.endsAt)).toBe('22:30');
    });

    it('drops the lowest-priority stop when the day would end more than 30 min late', () => {
      expect(lines([sunset, market2, walk], at(20, 10))).toEqual([
        '20:10 · Sunset at the Esplanade · next slot',
        '21:40 · Night market · shortened',
        'Drop · Clan Jetties at night · lowest priority',
      ]);
      const plan = ruleBasedNewDay({ stops: [sunset, market2, walk], arriveAt: at(20, 10) });
      expect(plan.costChange).toBe(-12);
      expect(clock(plan.endsAt)).toBe('22:10');
    });

    it('drops later stops first on ties, never the late stop or booked stops', () => {
      const late = stop('Penang Hill', at(18), at(19), { priority: 1 });
      const a = stop('Botanic Gardens', at(19), at(20));
      const b = stop('Gurney Drive hawkers', at(20), at(21), meal);
      const c = stop('Dessert stop', at(21), at(21, 30));
      const plan = ruleBasedNewDay({ stops: [late, a, b, c], arriveAt: at(19, 40) });
      expect(plan.items.filter((i) => i.dropped).map((i) => i.name)).toEqual(['Dessert stop']);
      expect(plan.items.find((i) => i.name === 'Penang Hill')!.dropped).toBe(false);

      const show = stop('Booked show', at(21, 30), at(22), { ...booked, category: 'sight' });
      const withShow = ruleBasedNewDay({ stops: [late, a, b, c, show], arriveAt: at(19, 40) });
      expect(withShow.items.find((i) => i.name === 'Booked show')).toMatchObject({ dropped: false, note: null });
    });
  });

  it('keeps an end time empty when the stop had none', () => {
    const open = stop('Gurney Plaza', at(15), null);
    const next = stop('Gurney Drive hawkers', at(19), null, meal);
    const plan = ruleBasedNewDay({ stops: [open, next], arriveAt: at(15, 20) });
    expect(plan.items[0]).toMatchObject({ name: 'Gurney Plaza', end: null, note: NOTES.nextSlot });
    expect(clock(plan.items[0].start)).toBe('15:20');
  });

  it('changes nothing when there is nothing to change', () => {
    expect(ruleBasedNewDay({ stops: [], arriveAt: at(10) })).toEqual({ items: [], costChange: 0, endsAt: null });
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

  it('takes the planned stops from the late one on, in time order, and marks only bookings fixed', () => {
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
      ['lunch', false],
      ['flight', true],
    ]);
    expect(out[0]).toMatchObject({ price: 15, priority: 2, outdoor: true });
    expect(remainingFrom(rows, 'nope')).toEqual([]);
  });
});
