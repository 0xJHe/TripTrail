import type { OptionPhoto } from '@/lib/ai';
import { refreshOptionPhoto } from './api';
import type { OptionPlan } from './types';

/** One refresh per photo per app session, shared by the swipe card and Results. */
const tried = new Map<string, Promise<OptionPhoto | null>>();

/** The landmark's Google place ID (older options kept it on the photo). */
export function photoPlaceId(plan: OptionPlan): string | null {
  return plan.placeId ?? plan.photo?.placeId ?? null;
}

/**
 * A fresh link for a photo that failed to load. Asks the Edge Function only the
 * first time for this place; later calls get the same answer. Null on any failure.
 */
export function freshPhoto(
  tripId: string,
  placeId: string,
  refresh: (tripId: string, placeId: string) => Promise<OptionPhoto | null> = refreshOptionPhoto,
): Promise<OptionPhoto | null> {
  const key = `${tripId}:${placeId}`;
  let answer = tried.get(key);
  if (!answer) {
    answer = refresh(tripId, placeId).catch((e) => {
      console.warn('refresh-photo failed, showing the drawing:', e instanceof Error ? e.message : e);
      return null;
    });
    tried.set(key, answer);
  }
  return answer;
}

/** For tests: forget which photos were refreshed. */
export function resetPhotoRefresh(): void {
  tried.clear();
}
