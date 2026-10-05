// weather: current weather at the stop the group is at, and the forecast for the
// next stop at its start time (Google Weather API).
// Cached per ~1 km area for 30 minutes in google_cache; while one request fetches an
// area, the rest of the group waits and reads what it saved. Max 30 weather calls
// per trip per day (take_weather_call). On any failure the reply has nulls and the
// app just hides the weather line.
//
// POST { tripId, now?: { lat, lng }, next?: { lat, lng, inMinutes } }
//   -> { now: Weather | null, next: HourWeather | null, limited, weatherCalls }
// Only signed-in members of the trip may call it (Authorization: Bearer <user JWT>).

import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, json, requireMember } from '../_shared/edge.ts';
import { weatherFor, type LatLng, type WeatherDeps } from '../_shared/weather.ts';

/** A fetch lock older than this is from a request that died; take it over. */
const LOCK_STALE_MS = 20_000;

function readPoint(v: unknown): LatLng | null {
  if (typeof v !== 'object' || v === null) return null;
  const { lat, lng } = v as Record<string, unknown>;
  return typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON: { tripId, now?, next? }' }, 400);
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const who = await requireMember(db, token, body.tripId);
  if (who instanceof Response) return who;

  const now = readPoint(body.now);
  const nextPoint = readPoint(body.next);
  const inMinutes = Number((body.next as Record<string, unknown> | undefined)?.inMinutes);
  const next = nextPoint ? { ...nextPoint, inMinutes: Number.isFinite(inMinutes) ? Math.min(inMinutes, 23 * 60) : 0 } : null;
  if (!now && !next) return json({ now: null, next: null, limited: false, weatherCalls: 0 });

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) return json({ error: 'GOOGLE_MAPS_API_KEY is not set' }, 500);
  const log = (m: string) => console.error(m);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const lockKey = (key: string) => `lock:${key}`;

  const deps: WeatherDeps = {
    fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }),
    apiKey,
    now: () => Date.now(),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    takeCall: async () => {
      const { data, error } = await admin.rpc('take_weather_call', { p_trip: who.tripId });
      if (error) {
        log(`take_weather_call failed: ${error.message}`);
        return false; // can't count it, so don't spend it
      }
      return data === true;
    },
    cacheGet: async (key) => {
      const { data } = await admin.from('google_cache').select('data').eq('key', key).maybeSingle();
      return data ? data.data : undefined;
    },
    cacheSet: async (key, data) => {
      const { error } = await admin.from('google_cache').upsert({ key, kind: 'weather', data });
      if (error) log(`google_cache write failed: ${error.message}`);
    },
    // The lock is a google_cache row: only one insert of the same key can win.
    claim: async (key) => {
      const row = { key: lockKey(key), kind: 'lock', data: { at: Date.now() } };
      const first = await admin.from('google_cache').insert(row);
      if (!first.error) return true;
      const { data } = await admin.from('google_cache').select('data').eq('key', row.key).maybeSingle();
      const at = data?.data?.at;
      if (typeof at === 'number' && Date.now() - at < LOCK_STALE_MS) return false;
      // Stale lock: replace it only if it is still the same stale row.
      const taken = await admin
        .from('google_cache')
        .update({ data: row.data })
        .eq('key', row.key)
        .eq('data->>at', String(at))
        .select('key');
      return !taken.error && (taken.data ?? []).length > 0;
    },
    release: async (key) => {
      await admin.from('google_cache').delete().eq('key', lockKey(key));
    },
  };

  const reply = await weatherFor(deps, { now, next }, (e) => log(`weather failed: ${e instanceof Error ? e.message : e}`));
  return json(reply);
});
