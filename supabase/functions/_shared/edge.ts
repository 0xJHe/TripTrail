// Helpers every Edge Function uses: CORS, JSON replies, the member check, Gemini,
// and Google deps backed by the google_cache table and the per-trip daily limit.
// No imports (the Supabase clients are passed in), so it stays plain TypeScript.

import type { GoogleDeps } from './google.ts';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** The bits of a Supabase client these helpers use. */
// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any; auth: any };

/** The signed-in user's member row in this trip, or an error reply. Reads go through RLS as that user. */
export async function requireMember(
  db: Db,
  token: string,
  tripId: unknown,
): Promise<{ memberId: string; tripId: string } | Response> {
  if (!token) return json({ error: 'Not signed in' }, 401);
  const { data: userData, error: userError } = await db.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ error: 'Not signed in' }, 401);
  if (typeof tripId !== 'string' || !tripId) return json({ error: 'tripId is required' }, 400);
  const { data: member } = await db
    .from('members')
    .select('id')
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!member) return json({ error: 'Not a member of this trip' }, 403);
  return { memberId: member.id as string, tripId };
}

/** One Gemini call that must answer with JSON. */
export async function askGemini(model: string, prompt: string, apiKey: string, temperature = 0.7): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) throw new Error('Gemini returned no text');
  return text;
}

/**
 * Google deps for one trip: google_cache in front of every call, and
 * take_google_call() to count calls (false after 60 today). `admin` must be a
 * service-role client: both tables are closed to the app.
 */
export function googleDeps(admin: Db, apiKey: string, tripId: string, log: (m: string) => void): GoogleDeps {
  return {
    fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }),
    apiKey,
    takeCall: async () => {
      const { data, error } = await admin.rpc('take_google_call', { p_trip: tripId });
      if (error) {
        log(`take_google_call failed: ${error.message}`);
        return false; // can't count it, so don't spend it
      }
      return data === true;
    },
    cacheGet: async (key) => {
      const { data } = await admin.from('google_cache').select('data').eq('key', key).maybeSingle();
      return data ? data.data : undefined;
    },
    cacheSet: async (key, kind, data) => {
      const { error } = await admin.from('google_cache').upsert({ key, kind, data });
      if (error) log(`google_cache write failed: ${error.message}`);
    },
  };
}
