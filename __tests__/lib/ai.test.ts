const mockInvoke = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } } }));

import { generateItinerary, generateTripOptions, OPTION_COUNT, sampleItinerary, sampleTripOptions, type MemberAnswers } from '@/lib/ai';

const beachLover: MemberAnswers = {
  dailyBudget: 150,
  foodNeeds: ['Halal'],
  mustHaves: ['Beach', 'Street food', 'Nature'],
  noGo: 'Early mornings',
};

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

describe('generateTripOptions', () => {
  const req = { destination: null, lengthMin: 2, lengthMax: 3, members: [beachLover] };
  const aiOption = {
    name: 'Ipoh', days: 2, costPerPerson: 260, tags: ['Cafés'], covers: ['Cafés'], avoids: [],
    halal: true, scene: 'highlands', dayTitles: ['Old town', 'Caves'],
  };
  beforeEach(() => {
    mockInvoke.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('calls the Edge Function with the trip id and returns its options', async () => {
    mockInvoke.mockResolvedValue({ data: { options: [aiOption], source: 'ai', note: null, googleCalls: 2 }, error: null });
    const result = await generateTripOptions('trip-1', req);
    expect(mockInvoke).toHaveBeenCalledWith('generate-trip-options', { body: { tripId: 'trip-1' } });
    expect(result).toEqual({ options: [aiOption], source: 'ai', note: null });
  });

  it('falls back to sample options when the function fails', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('offline') });
    const result = await generateTripOptions('trip-1', req);
    expect(result.source).toBe('sample');
    expect(result.options).toEqual(sampleTripOptions(req));
  });

  it('falls back to sample options when the reply is broken', async () => {
    mockInvoke.mockResolvedValue({ data: { options: 'nope' }, error: null });
    expect((await generateTripOptions('trip-1', req)).source).toBe('sample');
  });
});

describe('generateItinerary', () => {
  const fallback = { destination: 'Penang', days: 2, dayTitles: [], halal: true };
  const stop = {
    day: 1, time: '09:00', endTime: '10:30', name: 'Kek Lok Si Temple', price: 0, isEstimate: false,
    category: 'sight', isOutdoor: true, tip: 'Go early.', lat: 5.4, lng: 100.27, address: 'Air Itam, Penang', placeId: 'p1',
  };
  beforeEach(() => {
    mockInvoke.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('calls the Edge Function with the trip, option and start date', async () => {
    mockInvoke.mockResolvedValue({ data: { stops: [stop], source: 'ai', note: null, googleCalls: 1 }, error: null });
    const result = await generateItinerary('trip-1', 'opt-1', '2026-10-12', fallback);
    expect(mockInvoke).toHaveBeenCalledWith('generate-itinerary', {
      body: { tripId: 'trip-1', optionId: 'opt-1', start: '2026-10-12' },
    });
    expect(result).toEqual({ stops: [stop], source: 'ai', note: null });
  });

  it('falls back to the sample plan when the function fails', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('offline') });
    const result = await generateItinerary('trip-1', 'opt-1', null, fallback);
    expect(result).toEqual({ stops: sampleItinerary(fallback), source: 'sample', note: null });
  });
});
