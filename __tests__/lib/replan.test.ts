// "Ask AI for a better plan": Gemini prompt, checks and retry with fake answers. No real Gemini calls.
import {
  buildReplanPrompt,
  checkReplan,
  clockAt,
  dayEndOn,
  msAtClock,
  NOTES,
  replanWithAi,
  type PlanStop,
  type ReplanInput,
} from '@/supabase/functions/_shared/replan';

const MIN = 60_000;
const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).getTime();
const TZ = -new Date(at(12)).getTimezoneOffset(); // the test machine's clock, like the phone's
const clock = (iso: string | null) => (iso ? clockAt(Date.parse(iso), TZ) : null);

const stops: PlanStop[] = [
  { id: 'hill', name: 'Penang Hill funicular', start: at(9, 30), end: at(11), price: 15, fixed: false, priority: 2, category: 'sight', outdoor: true },
  { id: 'temple', name: 'Kek Lok Si Temple', start: at(11, 30), end: at(13, 30), price: 0, fixed: false, priority: 3, category: 'sight', outdoor: true },
  { id: 'food', name: 'Chulia Street street food', start: at(14, 30), end: at(15, 30), price: 16, fixed: true, category: 'food', priority: 2, outdoor: true },
  { id: 'jetty', name: 'Clan Jetties', start: at(16), end: at(17, 30), price: 12, fixed: false, priority: 1, category: 'sight', outdoor: true },
  { id: 'market', name: 'Batu Ferringhi night market', start: at(19), end: at(21), price: 20, fixed: false, priority: 2, category: 'shopping', outdoor: true },
];

const input: ReplanInput = {
  now: at(9, 8),
  arriveAt: at(10, 25),
  travelMin: 77,
  here: { lat: 5.4183, lng: 100.3376 },
  stops,
  dayEndsAt: at(22),
  tzOffsetMin: TZ,
  dailyBudget: 120,
  halal: true,
  foodNeeds: ['Halal'],
  mustHaves: ['Street food', 'Temples'],
  noGo: ['Long hikes'],
};

const answer = (list: Record<string, unknown>[]) => JSON.stringify({ stops: list });
const good = answer([
  { id: 'hill', start: '10:30', end: '11:45', drop: false },
  { id: 'temple', start: '12:15', end: '14:00', drop: false },
  { id: 'food', start: '14:30', end: '15:30', drop: false },
  { id: 'jetty', drop: true, reason: 'Short on time' },
  { id: 'market', start: '19:00', end: '21:00', drop: false },
]);

describe('replanWithAi', () => {
  it('turns a good answer into a new day with the same labels as the simple plan', async () => {
    const ask = jest.fn(async () => good);
    const { plan, geminiCalls } = await replanWithAi(input, { ask });
    expect(geminiCalls).toBe(1);
    expect(plan!.source).toBe('ai');
    expect(plan!.items.map((i) => [i.dropped ? 'Drop' : clock(i.start), i.name, i.note])).toEqual([
      ['10:30', 'Penang Hill funicular', NOTES.nextSlot],
      ['12:15', 'Kek Lok Si Temple', NOTES.shortened],
      ['14:30', 'Chulia Street street food', null],
      ['19:00', 'Batu Ferringhi night market', null],
      ['Drop', 'Clan Jetties', 'short on time'],
    ]);
    expect(plan!.costChange).toBe(-12);
  });

  it('retries once with the problem explained, then uses the second answer', async () => {
    const early = answer([
      { id: 'hill', start: '09:45', end: '11:00' },
      { id: 'temple', start: '11:30', end: '13:30' },
      { id: 'jetty', start: '16:00', end: '17:30' },
      { id: 'market', start: '19:00', end: '21:00' },
    ]);
    const prompts: string[] = [];
    const ask = jest.fn(async (prompt: string, attempt: number) => {
      prompts.push(prompt);
      return attempt === 0 ? early : good;
    });
    const { plan, geminiCalls } = await replanWithAi(input, { ask });
    expect(geminiCalls).toBe(2);
    expect(plan).not.toBeNull();
    expect(prompts[1]).toContain(`"Penang Hill funicular" can't start before ${clockAt(input.arriveAt, TZ)}`);
  });

  it('gives no plan (the app keeps the simple one) when both answers are bad', async () => {
    const log = jest.fn();
    const ask = jest.fn(async () => 'Sure! Here is a plan: ...');
    expect(await replanWithAi(input, { ask, log })).toEqual({ plan: null, geminiCalls: 2 });
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('never crashes when Gemini errors out', async () => {
    const ask = jest.fn(async () => {
      throw new Error('gemini-flash-latest 503: overloaded');
    });
    expect(await replanWithAi(input, { ask })).toEqual({ plan: null, geminiCalls: 2 });
  });

  it('does nothing without a Gemini key', async () => {
    expect(await replanWithAi(input, { ask: null })).toEqual({ plan: null, geminiCalls: 0 });
  });
});

describe('checkReplan', () => {
  it('keeps meals and bookings at their times, whatever Gemini says', () => {
    const moved = answer([
      { id: 'hill', start: '10:30', end: '11:45' },
      { id: 'temple', start: '12:00', end: '13:30' },
      { id: 'food', start: '16:00', end: '17:00', drop: true },
      { id: 'jetty', start: '16:00', end: '17:00' },
      { id: 'market', start: '19:00', end: '21:00' },
    ]);
    const food = checkReplan(moved, input).find((p) => p.id === 'food')!;
    expect(food).toMatchObject({ start: at(14, 30), end: at(15, 30), dropped: false });
  });

  it.each([
    ['a missing stop', answer([{ id: 'hill', start: '10:30', end: '11:45' }]), /"Kek Lok Si Temple" .* is missing/],
    ['overlapping stops', answer([
      { id: 'hill', start: '10:30', end: '12:30' },
      { id: 'temple', start: '12:00', end: '13:30' },
      { id: 'jetty', drop: true },
      { id: 'market', start: '19:00', end: '21:00' },
    ]), /"Kek Lok Si Temple" starts before "Penang Hill funicular" ends/],
    ['a day past 22:00', answer([
      { id: 'hill', start: '10:30', end: '11:45' },
      { id: 'temple', start: '12:00', end: '13:30' },
      { id: 'jetty', start: '16:00', end: '17:00' },
      { id: 'market', start: '21:00', end: '22:30' },
    ]), /must end by 22:00/],
    ['a bad time', answer([
      { id: 'hill', start: 'half ten', end: '11:45' },
      { id: 'temple', start: '12:00', end: '13:30' },
      { id: 'jetty', drop: true },
      { id: 'market', drop: true },
    ]), /needs a start time/],
    ['no list', '{"plan":[]}', /needs a "stops" list/],
  ])('rejects %s', (_, text, reason) => {
    expect(() => checkReplan(text, input)).toThrow(reason);
  });
});

describe('buildReplanPrompt', () => {
  const prompt = buildReplanPrompt(input);

  it('gives Gemini the time, travel, stops and everyone\'s answers', () => {
    expect(prompt).toContain(`It is ${clockAt(input.now, TZ)} now`);
    expect(prompt).toContain('about 77 min');
    expect(prompt).toContain('id "food": Chulia Street street food');
    expect(prompt).toContain('FIXED (booked or a meal)');
    expect(prompt).toContain('every food stop must stay halal');
    expect(prompt).toContain('Must-haves: Street food, Temples');
    expect(prompt).toContain('No-go: Long hikes');
    expect(prompt).toContain('daily budget RM 120');
    expect(prompt).toContain('Reply with JSON only');
  });
});

describe('phone-clock times', () => {
  it('turns "HH:MM" into a time on the same day and back', () => {
    expect(msAtClock('10:30', at(9), TZ)).toBe(at(10, 30));
    expect(clockAt(at(14, 5), TZ)).toBe('14:05');
    expect(dayEndOn(at(9, 30), TZ)).toBe(at(22));
    expect(msAtClock('25:00', at(9), TZ)).toBeNull();
    expect(msAtClock('10:30', at(9), 480)! - msAtClock('10:30', at(9), 420)!).toBe(-60 * MIN);
  });
});
