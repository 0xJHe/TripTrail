import type { StopCategory } from '@/lib/ai';
import { haversineMeters, type LatLng } from '@/lib/distance';

/**
 * Day recap story card (prototype screen 15). Pure rules: clean a day's saved positions into
 * a trail (GPS jitter and spikes out) and the stats (km, hours out), and each stop's marker emoji.
 */

/** One saved position (a `locations` row, or a demo route sample). */
export interface Fix extends LatLng {
  /** When (ms). */
  at: number;
}

/** Each position is replaced by the median of this many around it (removes GPS spikes). */
const MEDIAN_WINDOW = 5;
/** Moves shorter than this are GPS jitter (standing at a stop), not walking. */
export const MIN_STEP_M = 25;
/** Faster than this between two positions (after the median) is a jump in the GPS, not travel. */
const MAX_SPEED_KMH = 150;

const median = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

/** Positions in time order, unusable ones left out. */
function sorted(fixes: Fix[]): Fix[] {
  return fixes
    .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng) && Number.isFinite(f.at) && !(f.lat === 0 && f.lng === 0))
    .sort((a, b) => a.at - b.at);
}

const kmh = (a: Fix, b: Fix) => {
  const m = haversineMeters(a, b);
  if (m < MIN_STEP_M) return 0;
  const hours = Math.abs(b.at - a.at) / 3_600_000;
  return hours > 0 ? m / 1000 / hours : Infinity;
};

/** A position reached and left faster than 150 km/h (the first / last: left / reached) is a GPS jump. */
function dropSpikes(s: Fix[]): Fix[] {
  if (s.length < 3) return s;
  return s.filter((f, i) => {
    const into = i > 0 ? kmh(s[i - 1], f) > MAX_SPEED_KMH : true;
    const out = i < s.length - 1 ? kmh(f, s[i + 1]) > MAX_SPEED_KMH : true;
    return !(into && out);
  });
}

/**
 * The day's trail with GPS jitter smoothed out: jumps faster than 150 km/h are dropped, each
 * position becomes the median of the 5 around it (wild readings vanish), and
 * a point is only kept once it is 25 m from the last one kept (standing still at a stop
 * doesn't add up to kilometres). The last position is kept too, unless it is right by the last kept one.
 */
export function smoothTrail(fixes: Fix[]): Fix[] {
  const s = dropSpikes(sorted(fixes));
  if (s.length <= 2) return s;
  // Same number of positions on each side (fewer near the ends), so the ends stay where they were.
  const med = s.map((f, i) => {
    const r = Math.min(Math.floor(MEDIAN_WINDOW / 2), i, s.length - 1 - i);
    const w = s.slice(i - r, i + r + 1);
    return { at: f.at, lat: median(w.map((p) => p.lat)), lng: median(w.map((p) => p.lng)) };
  });

  const kept: Fix[] = [med[0]];
  for (let i = 1; i < med.length; i++) {
    const last = kept[kept.length - 1];
    if (kmh(last, med[i]) > MAX_SPEED_KMH) continue;
    if (haversineMeters(last, med[i]) >= MIN_STEP_M) kept.push(med[i]);
  }
  const end = med[med.length - 1];
  const last = kept[kept.length - 1];
  if (end !== last && haversineMeters(last, end) >= MIN_STEP_M / 2) kept.push(end);
  return kept;
}

/** Length of a trail in metres. */
export function trailMeters(trail: LatLng[]): number {
  let m = 0;
  for (let i = 1; i < trail.length; i++) m += haversineMeters(trail[i - 1], trail[i]);
  return m;
}

/** Time out: first to last saved position (ms). 0 with fewer than two. */
export function hoursOutMs(fixes: Fix[]): number {
  const s = sorted(fixes);
  return s.length < 2 ? 0 : s[s.length - 1].at - s[0].at;
}

/** Big number on the card: "0", "3.4", "38" (km). */
export function kmText(meters: number): string {
  const km = meters / 1000;
  if (km < 0.05) return '0';
  return km < 10 ? String(Math.round(km * 10) / 10) : String(Math.round(km));
}

/** Big number on the card: "40m", "6h", "6.5h", "13h". */
export function hoursText(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = min / 60;
  return h < 10 ? `${Math.round(h * 2) / 2}h` : `${Math.round(h)}h`;
}

// ---------- Stop markers ----------

const BY_NAME: [RegExp, string][] = [
  [/mosque|masjid/i, '🕌'],
  [/church|cathedral/i, '⛪'],
  [/temple|kek lok|kuil|pagoda|shrine/i, '🛕'],
  [/hill|cable car|funicular|peak/i, '🚡'],
  [/museum|gallery/i, '🖼️'],
  [/park|garden|forest|waterfall/i, '🌳'],
  [/caf[eé]|coffee|kopi/i, '☕'],
  [/night market|lantern/i, '🏮'],
];

const BY_CATEGORY: Record<StopCategory, string> = {
  flight: '✈️',
  hotel: '🏨',
  sight: '📸',
  food: '🍜',
  beach: '🏖️',
  shopping: '🛍️',
};

/** Emoji for a stop's marker: its category, with a few kinds of sight (and cafés, night markets) told apart by name. */
export function stopEmoji(stop: { name: string; category: StopCategory | null }): string {
  const { name, category } = stop;
  if (category === 'flight' || category === 'hotel' || category === 'beach') return BY_CATEGORY[category];
  if (category === 'food') return /caf[eé]|coffee|kopi/i.test(name) ? '☕' : /night market/i.test(name) ? '🏮' : '🍜';
  if (category === 'shopping') return /night market|lantern/i.test(name) ? '🏮' : '🛍️';
  const named = BY_NAME.find(([re]) => re.test(name));
  return named ? named[1] : category === 'sight' ? BY_CATEGORY.sight : '📍';
}

