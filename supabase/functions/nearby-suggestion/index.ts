// nearby-suggestion: one nearby place to fill the group's spare time before the next stop
// (running early, prototype screen 8). Google Places API (New) Nearby Search around the
// group, picked with simple rules from everyone's must-haves, food needs, no-gos and
// budget (no AI). Places are cached per ~500 m area for 1 hour in google_cache, and one
// pick per stop is saved there too: one phone asks Google, the rest of the group waits
// and reads it. Max 10 nearby searches per trip per day (take_api_call 'nearby').
// On any failure the suggestion is null and the app shows "Enjoy the extra time".
//
// POST { tripId, stopId, from: { lat, lng }, spareMin, localMinutes }
//   -> { suggestion: NearbySuggestion | null, limited, placesCalls }
// Only signed-in members of the trip may call it (Authorization: Bearer <user JWT>).

import { createClient } from 'npm:@supabase/supabase-js@2';

import { cacheLock, cors, json, readPoint, requireMember, takeApiCall } from '../_shared/edge.ts';
import { DAILY_NEARBY_LIMIT, groupPrefs, nearbyFor, type NearbyDeps } from '../_shared/nearby.ts';

/** A lock older than this is from a request that died; take it over. */
const LOCK_STALE_MS = 20_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON: { tripId, stopId, from, spareMin, localMinutes }' }, 400);
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const who = await requireMember(db, token, body.tripId);
  if (who instanceof Response) return who;

  const from = readPoint(body.from);
  const spareMin = Number(body.spareMin);
  const localMinutes = Number(body.localMinutes);
  if (typeof body.stopId !== 'string' || !from || !Number.isFinite(spareMin) || !Number.isFinite(localMinutes)) {
    return json({ error: 'stopId, from { lat, lng }, spareMin and localMinutes are required' }, 400);
  }

  // The trip's stops and everyone's answers, read as the user (so they must be in this trip).
  const [stopsRes, prefsRes] = await Promise.all([
    db.from('stops').select('id, name, place_id, day_number, status, price, actual_cost, lat, lng, category').eq('trip_id', who.tripId),
    db.from('preferences').select('daily_budget, food_needs, must_haves, no_go').eq('trip_id', who.tripId),
  ]);
  const next = (stopsRes.data ?? []).find((s) => s.id === body.stopId);
  if (!next) return json({ error: 'Stop not found in this trip' }, 404);
  if (next.lat == null || next.lng == null) return json({ suggestion: null, limited: false, placesCalls: 0 });
  const group = groupPrefs(prefsRes.data ?? [], stopsRes.data ?? [], next.day_number);

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) return json({ error: 'GOOGLE_MAPS_API_KEY is not set' }, 500);
  const log = (m: string) => console.error(m);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const deps: NearbyDeps = {
    fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }),
    apiKey,
    now: () => Date.now(),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    takeCall: () => takeApiCall(admin, who.tripId, 'nearby', DAILY_NEARBY_LIMIT, log),
    cacheGet: async (key) => {
      const { data } = await admin.from('google_cache').select('data').eq('key', key).maybeSingle();
      return data ? data.data : undefined;
    },
    cacheSet: async (key, data) => {
      const { error } = await admin.from('google_cache').upsert({ key, kind: 'nearby', data });
      if (error) log(`google_cache write failed: ${error.message}`);
    },
    ...cacheLock(admin, LOCK_STALE_MS),
  };

  const reply = await nearbyFor(
    deps,
    {
      stopId: next.id,
      from,
      next: { lat: next.lat, lng: next.lng, isFood: next.category === 'food' },
      spareMin,
      localMinutes: Math.max(0, Math.min(24 * 60, localMinutes)),
      planned: group.planned,
      prefs: group.prefs,
    },
    (e) => log(`nearby-suggestion failed: ${e instanceof Error ? e.message : e}`),
  );
  return json(reply);
});
