// place-search: Google Places search for "Add a stop".
// Cache first, max 60 Google calls per trip per day (shared with the other functions).
//
// POST { tripId, action: 'autocomplete', input, sessionToken, near? }
//   -> { suggestions: { placeId, name, detail }[] (max 5), limited }
// POST { tripId, action: 'details', placeId, sessionToken }
//   -> { place: { placeId, name, address, lat, lng } | null, limited }
// The app keeps one session token from the first letter typed until a place is
// picked, so Google bills the typing and the pick as one session.
// Only signed-in members of the trip may call it (Authorization: Bearer <user JWT>).

import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, googleDeps, json, requireMember } from '../_shared/edge.ts';
import { autocomplete, placeDetails, type LatLng } from '../_shared/google.ts';

const MIN_LETTERS = 3;

function readNear(v: unknown): LatLng | null {
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
    return json({ error: 'Body must be JSON' }, 400);
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const who = await requireMember(db, token, body.tripId);
  if (who instanceof Response) return json({ error: 'Not allowed' }, who.status);

  const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.slice(0, 64) : '';
  if (!sessionToken) return json({ error: 'sessionToken is required' }, 400);
  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!googleKey) return json({ error: 'GOOGLE_MAPS_API_KEY is not set' }, 500);

  const log = (m: string) => console.error(m);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const google = googleDeps(admin, googleKey, who.tripId, log);

  try {
    if (body.action === 'autocomplete') {
      const input = typeof body.input === 'string' ? body.input.trim().slice(0, 100) : '';
      if (input.length < MIN_LETTERS) return json({ suggestions: [], limited: false });
      const found = await autocomplete(google, input, sessionToken, readNear(body.near));
      return json({ suggestions: found.value ?? [], limited: found.limited });
    }
    if (body.action === 'details') {
      if (typeof body.placeId !== 'string' || !body.placeId) return json({ error: 'placeId is required' }, 400);
      const found = await placeDetails(google, body.placeId, sessionToken);
      return json({ place: found.value, limited: found.limited });
    }
    return json({ error: 'action must be autocomplete or details' }, 400);
  } catch (e) {
    log(`place-search failed: ${e instanceof Error ? e.message : e}`);
    return json({ error: 'Place search failed' }, 502);
  }
});
