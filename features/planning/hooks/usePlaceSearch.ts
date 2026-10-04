import { useEffect, useRef, useState } from 'react';

import { getPlace, searchPlaces, type PickedPlace, type PlaceSuggestion } from '../api';

/** Wait this long after the last letter before searching. */
export const SEARCH_DELAY_MS = 500;
export const MIN_LETTERS = 3;

/** Random token for one Google search session (typing + the pick are billed as one). */
export function newSessionToken(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/**
 * Search real places as the name is typed: 500 ms after typing stops, at
 * least 3 letters, at most 5 results. One session token until a place is picked.
 * `query` null = don't search (e.g. the name was just filled in by a pick).
 */
export function usePlaceSearch(tripId: string, query: string | null, near: { lat: number; lng: number } | null) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [limited, setLimited] = useState(false);
  const [failed, setFailed] = useState(false);
  const session = useRef<string | null>(null);
  const latest = useRef(0);
  const nearLat = near?.lat;
  const nearLng = near?.lng;

  useEffect(() => {
    const text = query?.trim() ?? '';
    if (text.length < MIN_LETTERS || limited) {
      setSuggestions([]);
      return;
    }
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      session.current ??= newSessionToken();
      setSearching(true);
      try {
        const where = nearLat != null && nearLng != null ? { lat: nearLat, lng: nearLng } : null;
        const result = await searchPlaces(tripId, text, session.current, where);
        if (id !== latest.current) return; // a newer search is on its way
        setSuggestions(result.suggestions);
        setLimited(result.limited);
        setFailed(false);
      } catch {
        if (id === latest.current) setFailed(true);
      } finally {
        if (id === latest.current) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [tripId, query, nearLat, nearLng, limited]);

  /** Address and location of a suggestion; ends the session. */
  async function pick(s: PlaceSuggestion): Promise<PickedPlace | null> {
    const token = session.current ?? newSessionToken();
    session.current = null;
    latest.current++;
    setSuggestions([]);
    try {
      const result = await getPlace(tripId, s.placeId, token);
      if (result.limited) setLimited(true);
      return result.place;
    } catch {
      setFailed(true);
      return null;
    }
  }

  return { suggestions, searching, limited, failed, pick, clear: () => setSuggestions([]) };
}
