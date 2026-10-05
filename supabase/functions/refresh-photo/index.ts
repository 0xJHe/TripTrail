// refresh-photo: a new Google photo link for a trip option, because old links stop
// working after a while. Uses the landmark's saved place ID (2 Google calls,
// counted in the 60 calls per trip per day; a fresh link is reused for 30 min).
// The new link is written back to the option and the landmark cache, so the rest
// of the group and the next options get it too. Only the link is kept: the photo
// itself is never copied into Supabase Storage.
//
// POST { tripId, placeId }  ->  { photo: { url, credit, creditUrl } | null, limited, googleCalls }
// Only signed-in members of the trip may call it (Authorization: Bearer <user JWT>),
// and only for a place one of the trip's options shows.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, googleDeps, json, requireMember } from '../_shared/edge.ts';
import { cacheKeys, refreshPlacePhoto } from '../_shared/google.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON: { tripId, placeId }' }, 400);
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const who = await requireMember(db, token, body.tripId);
  if (who instanceof Response) return who;

  const placeId = typeof body.placeId === 'string' ? body.placeId.trim().slice(0, 300) : '';
  if (!placeId) return json({ error: 'placeId is required' }, 400);

  // Only places this trip's options show (older options kept the ID on the photo).
  const { data: rows, error: rowsError } = await db.from('trip_options').select('id, plan_json').eq('trip_id', who.tripId);
  if (rowsError) return json({ error: rowsError.message }, 500);
  const matching = (rows ?? []).filter(
    (r) => (r.plan_json?.placeId ?? r.plan_json?.photo?.placeId) === placeId,
  );
  if (matching.length === 0) return json({ error: 'No option in this trip shows that place' }, 404);

  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!googleKey) return json({ error: 'GOOGLE_MAPS_API_KEY is not set' }, 500);
  const log = (m: string) => console.error(m);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const google = googleDeps(admin, googleKey, who.tripId, log);

  try {
    const found = await refreshPlacePhoto(google, placeId);
    const fresh = found.value;
    if (fresh) {
      const photo = { url: fresh.url, credit: fresh.credit, creditUrl: fresh.creditUrl };
      for (const r of matching) {
        const { error } = await db
          .from('trip_options')
          .update({ plan_json: { ...r.plan_json, placeId, photo } })
          .eq('id', r.id);
        if (error) log(`Saving the new photo link failed for option ${r.id}: ${error.message}`);
        const landmark = r.plan_json?.landmark;
        if (typeof landmark === 'string' && landmark) {
          await google.cacheSet(cacheKeys.photo(landmark), 'photo', { value: fresh });
        }
      }
      return json({ photo, limited: false, googleCalls: found.calls });
    }
    return json({ photo: null, limited: found.limited, googleCalls: found.calls });
  } catch (e) {
    log(`refresh-photo failed: ${e instanceof Error ? e.message : e}`);
    return json({ error: 'Photo refresh failed' }, 502);
  }
});
