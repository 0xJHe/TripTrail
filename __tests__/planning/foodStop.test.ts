import { isFoodPlaceType, looksLikeFood, placeCategory } from '@/features/planning/foodStop';
import { emptyForm, readStopForm } from '@/features/planning/stopForm';
import { halalLabels } from '@/features/planning/halal';

describe('isFoodPlaceType', () => {
  it.each([
    [['restaurant', 'food', 'point_of_interest']],
    [['cafe']],
    [['coffee_shop', 'cafe']],
    [['food_court']],
    [['bakery', 'store']],
    [['malaysian_restaurant', 'restaurant']],
    [['point_of_interest', 'establishment', 'meal_takeaway']],
    [['dessert_shop']],
  ])('%j is food', (types) => {
    expect(isFoodPlaceType(types)).toBe(true);
  });

  it('the main type decides: a hotel or a mall that also lists a restaurant is not food', () => {
    expect(isFoodPlaceType(['lodging', 'restaurant', 'food'])).toBe(false);
    expect(isFoodPlaceType(['shopping_mall', 'food'])).toBe(false);
    expect(isFoodPlaceType(['museum', 'tourist_attraction'])).toBe(false);
  });

  it('only generic types: food when "food" is among them', () => {
    expect(isFoodPlaceType(['point_of_interest', 'establishment', 'food'])).toBe(true);
    expect(isFoodPlaceType(['point_of_interest', 'establishment'])).toBe(false);
  });

  it('no types to go on: null', () => {
    expect(isFoodPlaceType(undefined)).toBeNull();
    expect(isFoodPlaceType([])).toBeNull();
  });
});

describe('looksLikeFood', () => {
  it.each([
    'Kopitiam Lam Heng',
    'Nasi kandar at Line Clear',
    'Mamak near the hotel',
    'Gurney Drive Hawker Centre',
    'Red Garden food court',
    'Toh Soon Café',
    'Toh Soon Cafe',
    'Ming Xiang Tai bakery',
    'Lunch with Ali',
    'Restoran Kapitan',
    'Penang Road famous laksa',
  ])('"%s" is food', (name) => {
    expect(looksLikeFood(name)).toBe(true);
  });

  it.each(['Kek Lok Si Temple', 'Penang Hill', 'Armenian Street murals', 'Meeting point', 'Coffeeless museum tour'])(
    '"%s" is not food',
    (name) => {
      expect(looksLikeFood(name)).toBe(false);
    },
  );
});

describe('placeCategory', () => {
  it('Google types win over the name', () => {
    expect(placeCategory('Line Clear', ['restaurant'])).toBe('food');
    expect(placeCategory('Food Museum', ['museum'])).toBe('sight');
  });

  it('no Google types: guessed from the name', () => {
    expect(placeCategory('Kopitiam Lam Heng', undefined)).toBe('food');
    expect(placeCategory('Penang Hill', undefined)).toBe('sight');
  });

  it('editing: an unchanged name keeps the category; a new non-food place leaves food', () => {
    const lineClear = { category: 'food' as const, name: 'Line Clear' };
    expect(placeCategory('Line Clear', undefined, lineClear)).toBe('food');
    expect(placeCategory('Kek Lok Si', undefined, lineClear)).toBe('sight');
    expect(placeCategory('Kek Lok Si', ['place_of_worship'], lineClear)).toBe('sight');
    // Other categories stay when it isn't food.
    expect(placeCategory('Batu Ferringhi', undefined, { category: 'beach', name: 'Batu Ferringhi beach' })).toBe('beach');
    expect(placeCategory('Lunch at the beach', undefined, { category: 'beach', name: 'Batu Ferringhi' })).toBe('food');
  });
});

describe('readStopForm food stops', () => {
  const base = { ...emptyForm(1), time: '12:30', endTime: '13:30', price: '15' };

  it('a picked Google restaurant is saved as food', () => {
    const read = readStopForm(
      { ...base, name: 'Line Clear', place: { placeId: 'p1', address: 'George Town', lat: 5.41, lng: 100.33, types: ['restaurant'] } },
      '2026-10-12',
    );
    expect(read.ok && read.fields.category).toBe('food');
  });

  it('a typed hawker stop is saved as food, a typed sight is not', () => {
    const hawker = readStopForm({ ...base, name: 'New Lane hawker stalls' }, '2026-10-12');
    expect(hawker.ok && hawker.fields.category).toBe('food');
    const sight = readStopForm({ ...base, name: 'Fort Cornwallis' }, '2026-10-12');
    expect(sight.ok && sight.fields.category).toBe('sight');
  });

  it('booked stops stay flight / hotel whatever the name', () => {
    const hotel = readStopForm({ ...base, kind: 'hotel', name: 'Restaurant hotel check-in' }, '2026-10-12');
    expect(hotel.ok && hotel.fields.category).toBe('hotel');
  });

  it('a food stop added by hand gets the halal tag and JAKIM link like an AI one', () => {
    const read = readStopForm(
      { ...base, name: 'Kopitiam Lam Heng', place: { placeId: null, address: 'George Town, Penang, Malaysia', lat: 5.41, lng: 100.33 } },
      '2026-10-12',
    );
    if (!read.ok) throw new Error('form should be fine');
    const labels = halalLabels(read.fields, true);
    expect(labels.tag).toBe(true);
    expect(labels.jakim).toBe(true);
    expect(halalLabels(read.fields, false)).toEqual({ tag: false, jakim: false });
  });
});
