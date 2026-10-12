import type { Stop } from './types';

/**
 * Halal labels on food stops. No API calls. Only when at least one person in the trip chose
 * halal in their preferences; otherwise food stops show nothing extra.
 * - every food stop: "Halal-friendly · not verified" (a soft grey tag: nobody has confirmed it);
 *   Day plan, Edit stop, and the running-early and rain cards (those: the tag only);
 * - food stops in Malaysia, Day plan and Edit stop only: "Check halal status →", JAKIM's
 *   official halal search (Food premises) with the stop's name filled in. Not outside Malaysia.
 */

export const HALAL_TAG = 'Halal-friendly · not verified';
export const JAKIM_LINK = 'Check halal status →';

/** JAKIM's Malaysia Halal Portal search, category "Premis Makanan" (food premises), name pre-filled. */
export function jakimSearchUrl(name: string): string {
  return `https://www.halal.gov.my/index.php?data=ZGlyZWN0b3J5L2luZGV4X2RpcmVjdG9yeTs7Ozs=&category=PE&cari=${encodeURIComponent(name.trim())}`;
}

export function isFoodStop(stop: Pick<Stop, 'category'>): boolean {
  return stop.category === 'food';
}

const OTHER_COUNTRY = /\b(singapore|thailand|indonesia|brunei|philippines|vietnam|japan|korea|china|taiwan|australia)\b/i;
const MALAYSIA =
  /\b(malaysia|kuala lumpur|selangor|penang|pulau pinang|george ?town|johor|kedah|kelantan|terengganu|pahang|perak|perlis|melaka|malacca|negeri sembilan|sabah|sarawak|labuan|putrajaya|langkawi)\b/i;

// Rough outlines of Malaysia [lng, lat]: Peninsular (Singapore and southern Thailand kept out)
// and Sabah + Sarawak (Brunei taken out below). Good to a few km at the borders.
const PENINSULAR: [number, number][] = [
  [99.55, 6.5], [99.9, 5.2], [100.6, 3.6], [101.1, 2.85], [101.75, 2.3], [102.5, 1.85], [103.3, 1.3],
  [103.5, 1.26], [103.62, 1.4], [103.72, 1.45], [103.85, 1.465], [104.0, 1.43], [104.1, 1.36], [104.4, 1.35],
  [104.5, 2.9], [103.7, 4.0], [103.6, 5.0], [102.8, 6.1], [102.3, 6.25], [102.1, 6.24], [101.96, 6.02],
  [101.82, 5.75], [101.15, 5.62], [100.98, 5.8], [100.8, 6.25], [100.55, 6.47], [100.35, 6.67], [100.15, 6.72],
];
const BORNEO: [number, number][] = [
  [109.6, 1.9], [110.3, 0.95], [111.0, 0.95], [111.8, 1.0], [112.5, 1.5], [113.5, 1.25], [114.3, 1.5],
  [114.8, 2.2], [115.2, 2.8], [115.5, 3.6], [115.65, 4.0], [116.0, 4.35], [117.0, 4.3], [117.6, 4.15],
  [118.8, 4.1], [119.3, 5.3], [118.4, 5.95], [117.6, 7.2], [116.8, 7.1], [116.0, 6.6], [115.3, 5.6],
  [114.6, 5.2], [114.0, 4.8], [113.0, 3.4], [111.5, 2.9], [110.5, 2.0], [109.5, 2.2],
];
// Brunei's two parts [minLng, minLat, maxLng, maxLat].
const BRUNEI: [number, number, number, number][] = [
  [114.07, 4.0, 114.98, 5.08],
  [115.03, 4.3, 115.37, 4.95],
];

function inside(poly: [number, number][], lng: number, lat: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Is the stop in Malaysia? Its saved address first (a country or a Malaysian state named in
 * it), else its location. False when neither says.
 */
export function inMalaysia(stop: Pick<Stop, 'address' | 'lat' | 'lng'>): boolean {
  const address = stop.address?.trim();
  if (address) {
    if (/\bmalaysia\b/i.test(address)) return true;
    if (OTHER_COUNTRY.test(address)) return false;
    if (MALAYSIA.test(address)) return true;
  }
  const { lat, lng } = stop;
  if (lat == null || lng == null) return false;
  if (BRUNEI.some(([x0, y0, x1, y1]) => lng >= x0 && lng <= x1 && lat >= y0 && lat <= y1)) return false;
  return inside(PENINSULAR, lng, lat) || inside(BORNEO, lng, lat);
}

/** What a stop shows: for food stops when someone needs halal, the grey tag (+ the JAKIM link in Malaysia); else nothing. */
export function halalLabels(
  stop: Pick<Stop, 'category' | 'address' | 'lat' | 'lng'>,
  needsHalal: boolean,
): { tag: boolean; jakim: boolean } {
  if (!needsHalal || !isFoodStop(stop)) return { tag: false, jakim: false };
  return { tag: true, jakim: inMalaysia(stop) };
}
