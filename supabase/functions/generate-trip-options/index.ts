// generate-trip-options: reads the trip and everyone's answers, asks Gemini for 4–5
// trip options that fit everyone (budget, shared free dates, food needs, no-go),
// and adds one Google photo per option from its landmark (cache first, max 60
// Google calls per trip per day). If an option doesn't fit, Gemini gets one retry
// with the problems; only if it can't be done are the closest options returned,
// with a short note. After two failed tries the sample options are used.
//
// POST { tripId }  ->  { options: TripOptionDraft[], source: 'ai' | 'sample', note, reason?, googleCalls }
// (note: why the options can't fit everyone; reason: why Gemini wasn't used)
// Only signed-in members of the trip may call it (Authorization: Bearer <user JWT>).

import { createClient } from 'npm:@supabase/supabase-js@2';

import { askGemini, cors, googleDeps, json, requireMember } from '../_shared/edge.ts';
import { findLandmarkPhoto } from '../_shared/google.ts';
import { planTripOptions, type MemberAnswers, type TripOptionsRequest } from '../_shared/tripOptions.ts';

// The retry uses a lighter model, in case the first one is busy (503) or gone (404).
const MODELS = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest',
  Deno.env.get('GEMINI_FALLBACK_MODEL') ?? 'gemini-flash-lite-latest',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  let tripId: unknown;
  try {
    tripId = (await req.json())?.tripId;
  } catch {
    return json({ error: 'Body must be JSON: { tripId }' }, 400);
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const who = await requireMember(db, token, tripId);
  if (who instanceof Response) return who;

  const [{ data: trip, error: tripError }, { data: prefs, error: prefsError }, { count }] = await Promise.all([
    db.from('trips').select('*').eq('id', who.tripId).single(),
    db.from('preferences').select('*').eq('trip_id', who.tripId),
    db.from('members').select('id', { count: 'exact', head: true }).eq('trip_id', who.tripId),
  ]);
  if (tripError || !trip) return json({ error: 'Trip not found' }, 404);
  if (prefsError) return json({ error: prefsError.message }, 500);

  const all = prefs ?? [];
  const answered = all.filter((p) => p.daily_budget != null && (p.free_dates ?? []).length > 0);
  const used = answered.length ? answered : all;
  const members: MemberAnswers[] = used.map((p) => ({
    dailyBudget: p.daily_budget != null ? Number(p.daily_budget) : null,
    foodNeeds: p.food_needs ?? [],
    mustHaves: p.must_haves ?? [],
    noGo: p.no_go ?? null,
  }));
  // With fixed trip dates, only those dates count.
  const fixed = trip.dates_fixed && trip.start_date && trip.end_date;
  const freeDates: string[][] = used.map((p) =>
    (p.free_dates ?? []).filter((d: string) => !fixed || (d >= trip.start_date && d <= trip.end_date)),
  );
  const request: TripOptionsRequest = {
    destination: trip.destination ?? null,
    lengthMin: trip.length_min ?? trip.length_days ?? 2,
    lengthMax: trip.length_days ?? 3,
    members,
    freeDates,
    totalMembers: count ?? members.length,
  };
  if (request.lengthMin > request.lengthMax) request.lengthMin = request.lengthMax;

  const log = (m: string) => console.error(m);
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const google = googleKey ? googleDeps(admin, googleKey, who.tripId, log) : null;
  if (!geminiKey) log('GEMINI_API_KEY is not set');
  if (!googleKey) log('GOOGLE_MAPS_API_KEY is not set');

  let geminiCalls = 0;
  const result = await planTripOptions(request, {
    ask: geminiKey
      ? (prompt, attempt) => {
          geminiCalls++;
          return askGemini(MODELS[attempt] ?? MODELS[0], prompt, geminiKey, 0.8);
        }
      : null,
    findPhoto: google ? (landmark) => findLandmarkPhoto(google, landmark) : null,
    log,
  });
  return json({ ...result, geminiCalls });
});
