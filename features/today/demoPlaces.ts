import { haversineMeters, offsetMeters, type LatLng } from '@/lib/distance';
import type { NearbySuggestion, RainOption } from '@/supabase/functions/_shared/nearby';

/**
 * Demo mode only: made-up places near the group for when Google Places fails or finds
 * nothing, so the running-early card always has a suggestion and the rain card always has
 * options. Real mode never uses these (it shows "Enjoy the extra time" / "consider moving it").
 */

interface DemoPlace {
  id: string;
  name: string;
  kind: string;
  category: NearbySuggestion['category'];
  /** Metres east, north of the group. */
  east: number;
  north: number;
  /** Rough price per person, RM. */
  price: number;
}

const WALK_M_PER_MIN = 80;

/** Running early: one quiet café a short walk away. */
const EARLY: DemoPlace = {
  id: 'demo-kopi-corner',
  name: 'Kopi & Kaya Corner',
  kind: 'Café',
  category: 'food',
  east: 250,
  north: 250,
  price: 12,
};

/** Rain backup: three indoor places, nearest first. */
const RAIN: DemoPlace[] = [
  { id: 'demo-heritage-museum', name: 'Old Town Heritage Museum', kind: 'Museum', category: 'sight', east: -220, north: 200, price: 10 },
  { id: 'demo-batik-gallery', name: 'Batik Art Gallery', kind: 'Art gallery', category: 'sight', east: 380, north: -400, price: 5 },
  { id: 'demo-tea-house', name: 'Lantern Tea House', kind: 'Café', category: 'food', east: -600, north: -550, price: 15 },
];

function place(p: DemoPlace, from: LatLng) {
  const at = offsetMeters(from, p.east, p.north);
  const distanceM = Math.round(haversineMeters(from, at));
  return { at, distanceM, walkMin: Math.max(1, Math.round(distanceM / WALK_M_PER_MIN)) };
}

/** The running-early suggestion near `from`. */
export function demoSuggestion(from: LatLng): NearbySuggestion {
  const { at, distanceM, walkMin } = place(EARLY, from);
  return {
    ...at,
    placeId: EARLY.id,
    name: EARLY.name,
    kind: EARLY.kind,
    category: EARLY.category,
    outdoor: false,
    distanceM,
    walkMin,
    price: EARLY.price,
    withinBudget: null,
    reason: `${EARLY.kind} ${distanceM} m away`,
    halalNote: false,
  };
}

/** Three rain options near `from`, nearest first. */
export function demoRainOptions(from: LatLng): RainOption[] {
  return RAIN.map((p) => {
    const { at, distanceM, walkMin } = place(p, from);
    return {
      ...at,
      placeId: p.id,
      name: p.name,
      kind: p.kind,
      category: p.category,
      distanceM,
      walkMin,
      ride: false,
      price: p.price,
      halalNote: false,
      mustHave: null,
    };
  }).sort((a, b) => a.distanceM - b.distanceM);
}
