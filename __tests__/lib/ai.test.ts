const mockInvoke = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } } }));

import { generateTripOptions, OPTION_COUNT, sampleTripOptions, type MemberAnswers } from '@/lib/ai';

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
    mockInvoke.mockResolvedValue({ data: { options: [aiOption], source: 'ai' }, error: null });
    const result = await generateTripOptions('trip-1', req);
    expect(mockInvoke).toHaveBeenCalledWith('generate-trip-options', { body: { tripId: 'trip-1' } });
    expect(result).toEqual({ options: [aiOption], source: 'ai' });
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
