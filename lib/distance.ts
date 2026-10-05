// Distance helpers. Distance Matrix calls (cached) will live here too.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Straight-line distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/** The point `east` / `north` metres away (good enough for a few km). */
export function offsetMeters(p: LatLng, east: number, north: number): LatLng {
  return {
    lat: p.lat + (north / EARTH_M) * (180 / Math.PI),
    lng: p.lng + (east / (EARTH_M * Math.cos(rad(p.lat)))) * (180 / Math.PI),
  };
}

/** Average position. */
export function centroid(points: LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
  };
}
