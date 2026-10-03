import { generateTripOptions, OPTION_COUNT, sampleTripOptions, type MemberAnswers } from '@/lib/ai';

const beachLover: MemberAnswers = {
  dailyBudget: 150,
  foodNeeds: ['Halal'],
  mustHaves: ['Beach', 'Street food', 'Nature'],
  noGo: 'Early mornings',
};

describe('sample trip options', () => {
  it('returns 5 options that fit the trip length', async () => {
    const options = await generateTripOptions({ destination: null, lengthMin: 2, lengthMax: 3, members: [beachLover] });
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
