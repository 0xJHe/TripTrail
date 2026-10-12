import { refreshOptionPhoto, type PhotoRefresh } from './api';
import type { OptionPlan } from './types';

/** One refresh per photo per app session, shared by the swipe card and Results. */
const tried = new Map<string, Promise<PhotoRefresh>>();

/** The landmark's Google place ID (older options kept it on the photo). */
export function photoPlaceId(plan: OptionPlan): string | null {
  return plan.placeId ?? plan.photo?.placeId ?? null;
}

/**
 * A fresh link for a photo that failed to load. Asks the Edge Function only the
 * first time for this place; later calls get the same answer. No photo on any failure;
 * `limited` only when a daily limit was the reason.
 */
export function freshPhoto(
  tripId: string,
  placeId: string,
  refresh: (tripId: string, placeId: string) => Promise<PhotoRefresh> = refreshOptionPhoto,
): Promise<PhotoRefresh> {
  const key = `${tripId}:${placeId}`;
  let answer = tried.get(key);
  if (!answer) {
    answer = refresh(tripId, placeId).catch((e) => {
      console.warn('refresh-photo failed, showing the drawing:', e instanceof Error ? e.message : e);
      return { photo: null, limited: false };
    });
    tried.set(key, answer);
  }
  return answer;
}

/** For tests: forget which photos were refreshed. */
export function resetPhotoRefresh(): void {
  tried.clear();
}
