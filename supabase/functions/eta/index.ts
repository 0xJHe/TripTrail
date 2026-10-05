// eta: real travel time from where the group is to the next stop (Google Routes API),
// for the running-late check. The app only calls this when its free straight-line
// estimate says the group may be late. One answer per stop and check is saved in
// google_cache: one phone asks Google, the rest of the group waits and reads it.
// Max 20 Routes calls per trip per day (take_api_call 'routes'). On any failure the
// reply has minutes null and the app keeps its free estimate.
//
// POST { tripId, stopId, kind: 'before' | 'left', from: { lat, lng } }
//   -> { minutes: number | null, source: 'google' | null, limited, routesCalls }
// Only signed-in members of the trip may call it (Authorization: Bearer <user JWT>).

import { createClient } from 'npm:@supabase/supabase-js@2';

import { cacheLock, cors, json, readPoint, requireMember, takeApiCall } from '../_shared/edge.ts';
import { DAILY_ROUTES_LIMIT, etaFor, type CheckKind, type EtaDeps } from '../_shared/eta.ts';

/** A lock older than this is from a request that died; take it over. */
const LOCK_STALE_MS = 20_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON: { tripId, stopId, kind, from }' }, 400);
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const who = await requireMember(db, token, body.tripId);
  if (who instanceof Response) return who;

  const kind = body.kind === 'before' || body.kind === 'left' ? (body.kind as CheckKind) : null;
  const from = readPoint(body.from);
  if (typeof body.stopId !== 'string' || !kind || !from) {
    return json({ error: 'stopId, kind ("before" or "left") and from { lat, lng } are required' }, 400);
  }
  // Where to: the stop's saved location (read as the user, so it must be in this trip).
  const { data: stop } = await db
    .from('stops')
    .select('id, lat, lng')
    .eq('id', body.stopId)
    .eq('trip_id', who.tripId)
    .maybeSingle();
  if (!stop) return json({ error: 'Stop not found in this trip' }, 404);
  if (stop.lat == null || stop.lng == null) return json({ minutes: null, source: null, limited: false, routesCalls: 0 });

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) return json({ error: 'GOOGLE_MAPS_API_KEY is not set' }, 500);
  const log = (m: string) => console.error(m);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const deps: EtaDeps = {
    fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }),
    apiKey,
    now: () => Date.now(),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    takeCall: () => takeApiCall(admin, who.tripId, 'routes', DAILY_ROUTES_LIMIT, log),
    cacheGet: async (key) => {
      const { data } = await admin.from('google_cache').select('data').eq('key', key).maybeSingle();
      return data ? data.data : undefined;
    },
    cacheSet: async (key, data) => {
      const { error } = await admin.from('google_cache').upsert({ key, kind: 'eta', data });
      if (error) log(`google_cache write failed: ${error.message}`);
    },
    ...cacheLock(admin, LOCK_STALE_MS),
  };

  const reply = await etaFor(
    deps,
    { stopId: stop.id, kind, from, to: { lat: stop.lat, lng: stop.lng } },
    (e) => log(`eta failed: ${e instanceof Error ? e.message : e}`),
  );
  return json(reply);
});
