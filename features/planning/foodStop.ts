import type { Stop } from './types';

type Category = NonNullable<Stop['category']>;

/** Google types that say nothing about what the place is. */
const GENERIC_TYPES = new Set(['point_of_interest', 'establishment', 'store', 'food_store', 'tourist_attraction']);

/** Google place types (Places API New) that make a stop a food stop. Any "*_restaurant" counts too. */
const FOOD_TYPES = new Set([
  'restaurant',
  'food',
  'food_court',
  'cafe',
  'coffee_shop',
  'cafeteria',
  'tea_house',
  'bakery',
  'bagel_shop',
  'donut_shop',
  'dessert_shop',
  'ice_cream_shop',
  'juice_shop',
  'acai_shop',
  'sandwich_shop',
  'deli',
  'diner',
  'bistro',
  'snack_bar',
  'meal_takeaway',
  'meal_delivery',
  'steak_house',
  'hawker_centre',
  'hawker_center',
]);

/**
 * Food or not from Google's place types: the first specific one decides (primary type first),
 * so a hotel that also lists "restaurant" stays a hotel. Null = no types to go on.
 */
export function isFoodPlaceType(types: readonly string[] | null | undefined): boolean | null {
  const main = types?.find((t) => !GENERIC_TYPES.has(t));
  if (!main) return types?.length ? types.includes('food') : null;
  return FOOD_TYPES.has(main) || main.endsWith('_restaurant');
}

/**
 * Words in a stop name that mean eating (English + Malaysian), for stops typed by hand.
 * Ends with (?![a-z]) rather than \b: "café" ends in é, which \b doesn't count as a letter.
 */
const FOOD_WORDS =
  /\b(restaurants?|restoran|caf[eé]s?|coffee|kopitiam|kopi|mamak|nasi|mee|laksa|hawkers?|food ?courts?|foodcourt|street food|bakery|bakeri|breakfast|brunch|lunch|dinner|supper|roti|satay|dim sum|bistro|eatery|canteen|kantin|warung|kedai makan|gerai|noodles?|ramen|sushi|pizza|burgers?|desserts?|cendol|teh tarik|night market|pasar malam|steakhouse|diner|dining|food)(?![a-z])/i;

/** Food or not from the name alone ("Kopitiam Lam Heng", "Nasi kandar at Line Clear"). */
export function looksLikeFood(name: string): boolean {
  return FOOD_WORDS.test(name);
}

/**
 * Category of a place stop (not flights / hotels) when it's added or edited. Google's types of
 * the place picked in the form decide first; with none, the name does. A stop that turns out not
 * to be food leaves 'food' (-> 'sight'), any other category stays. An edited stop whose name
 * wasn't changed and no new place picked keeps its category (an AI food stop called "Line Clear").
 */
export function placeCategory(
  name: string,
  types: readonly string[] | null | undefined,
  old: { category: Stop['category']; name: string } | null = null,
): Category {
  const oldCategory = old?.category;
  const keep: Category = oldCategory && oldCategory !== 'flight' && oldCategory !== 'hotel' ? oldCategory : 'sight';
  const notFood: Category = keep === 'food' ? 'sight' : keep;
  const fromGoogle = isFoodPlaceType(types);
  if (fromGoogle != null) return fromGoogle ? 'food' : notFood;
  if (looksLikeFood(name)) return 'food';
  return old && old.name.trim() === name.trim() ? keep : notFood;
}
