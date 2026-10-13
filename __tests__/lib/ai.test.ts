const mockInvoke = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } } }));

import {
  AI_UNREACHABLE,
  aiStopOf,
  AiUnavailableError,
  generateItinerary,
  generateTripOptions,
  OPTION_COUNT,
  sampleTripOptions,
  type MemberAnswers,
} from '@/lib/ai';

const beachLover: MemberAnswers = {
  dailyBudget: 150,
  foodNeeds: ['Halal'],
  mustHaves: ['Beach', 'Street food', 'Nature'],
  noGo: 'Early mornings',
};

// Kept only for clearly labelled examples; never a real trip's options.
describe('sample trip options', () => {
  it('returns 5 options that fit the trip length', () => {
    const options = sampleTripOptions({ destination: null, lengthMin: 2, lengthMax: 3, members: [beachLover] });
    expect(options).toHaveLength(OPTION_COUNT);
    for (const o of options) {
      expect(o.days).toBeGreaterThanOrEqual(2);
      expect(o.days).toBeLessThanOrEqual(3);
      expect(o.dayTitles).toHaveLength(o.days);
      expect(o.costPerPerson).toBeGreaterThan(0);
    }
  });

  it('ranks places by what the group wants', () => {
    const options = sampleTripOptions({ destination: null, lengthMin: 2, lengthMax: 3, members: [beachLover] });
    expect(options[0].name).toBe('Penang');
    expect(options[0].costPerPerson).toBe(380);
    // Cameron Highlands has early-morning walks, a no-go here.
    expect(options.map((o) => o.name)).not.toContain('Cameron Highlands');
  });

  it('keeps halal-friendly places first when someone needs halal', () => {
    const options = sampleTripOptions({ destination: null, lengthMin: 3, lengthMax: 3, members: [beachLover] });
    const bangkok = options.findIndex((o) => o.name === 'Bangkok');
    expect(bangkok === -1 || bangkok > 2).toBe(true);
  });

  it('makes styles of the same trip when the place is already known', () => {
    const options = sampleTripOptions({ destination: 'Bali', lengthMin: 4, lengthMax: 5, members: [beachLover] });
    expect(options.map((o) => o.name)).toEqual(['Bali highlights', 'Bali, easy pace', 'Bali on a budget']);
    expect(options[0].days).toBe(5);
    expect(options[2].costPerPerson).toBeLessThan(options[0].costPerPerson);
  });
});

/** What supabase-js gives back when the function can't be reached. */
const fetchError = () => Object.assign(new Error('Failed to send a request to the Edge Function'), { name: 'FunctionsFetchError' });

describe('generateTripOptions', () => {
  const aiOption = {
    name: 'Ipoh', days: 2, costPerPerson: 260, tags: ['Cafés'], covers: ['Cafés'], avoids: [],
    halal: true, scene: 'highlands', dayTitles: ['Old town', 'Caves'],
  };
  beforeEach(() => {
    mockInvoke.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('calls the Edge Function with the trip id and returns its options', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'ok', options: [aiOption], note: null, googleCalls: 2 }, error: null });
    const result = await generateTripOptions('trip-1');
    expect(mockInvoke).toHaveBeenCalledWith('generate-trip-options', { body: { tripId: 'trip-1' } });
    expect(result).toEqual({ options: [aiOption], note: null });
  });

  it('says the AI is busy (no sample options) when the models are busy this minute', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'busy', options: [], note: null }, error: null });
    const e = await generateTripOptions('trip-1').catch((x) => x);
    expect(e).toBeInstanceOf(AiUnavailableError);
    expect(aiStopOf(e)).toBe('busy');
  });

  it("says today's free AI limit is reached (no sample options) when every model is used up", async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'limit', options: [], note: null }, error: null });
    expect(aiStopOf(await generateTripOptions('trip-1').catch((x) => x))).toBe('limit');
  });

  it('logs which model answered', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'ok', options: [aiOption], note: null, model: 'gemini-3.8-flash' }, error: null });
    await generateTripOptions('trip-1');
    expect(console.log).toHaveBeenCalledWith('generate-trip-options: answered by gemini-3.8-flash');
  });

  it("never makes sample options when the function can't be reached: a clear error instead", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: fetchError() });
    await expect(generateTripOptions('trip-1')).rejects.toThrow(AI_UNREACHABLE);
    mockInvoke.mockRejectedValue(new Error('timeout'));
    await expect(generateTripOptions('trip-1')).rejects.toThrow(AI_UNREACHABLE);
  });

  it('treats a broken reply as busy (nothing to save, try again)', async () => {
    mockInvoke.mockResolvedValue({ data: { options: 'nope' }, error: null });
    expect(aiStopOf(await generateTripOptions('trip-1').catch((x) => x))).toBe('busy');
  });
});

describe('generateItinerary', () => {
  const stop = {
    day: 1, time: '09:00', endTime: '10:30', name: 'Kek Lok Si Temple', price: 0, isEstimate: false,
    category: 'sight', isOutdoor: true, tip: 'Go early.', lat: 5.4, lng: 100.27, address: 'Air Itam, Penang', placeId: 'p1',
  };
  beforeEach(() => {
    mockInvoke.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('calls the Edge Function with the trip, option and start date', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'ok', stops: [stop], note: null, googleCalls: 1 }, error: null });
    const result = await generateItinerary('trip-1', 'opt-1', '2026-10-12');
    expect(mockInvoke).toHaveBeenCalledWith('generate-itinerary', {
      body: { tripId: 'trip-1', optionId: 'opt-1', start: '2026-10-12' },
    });
    expect(result).toEqual({ stops: [stop], note: null });
  });

  it('says busy / limit (no sample plan) when there is no AI plan', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'busy', stops: [], note: null }, error: null });
    expect(aiStopOf(await generateItinerary('trip-1', 'opt-1', null).catch((x) => x))).toBe('busy');
    mockInvoke.mockResolvedValue({ data: { status: 'limit', stops: [], note: null }, error: null });
    expect(aiStopOf(await generateItinerary('trip-1', 'opt-1', null).catch((x) => x))).toBe('limit');
  });

  it("never makes a sample plan when the function can't be reached", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: fetchError() });
    await expect(generateItinerary('trip-1', 'opt-1', null)).rejects.toThrow(AI_UNREACHABLE);
  });

  it("passes on the function's own error (e.g. the plan is already built)", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { name: 'FunctionsHttpError' }) });
    await expect(generateItinerary('trip-1', 'opt-1', null)).rejects.toThrow('non-2xx');
  });
});
