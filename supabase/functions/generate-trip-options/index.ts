// generate-trip-options: reads the trip and everyone's answers, asks Gemini for 4–5
// trip options that fit everyone (budget, shared free dates, food needs, no-go),
// and adds one Google photo per option from its landmark (cache first, max 60
// Google calls per trip per day). If an option doesn't fit, Gemini gets one retry
// with the problems; only if it can't be done are the closest options returned,
// with a short note. After two failed tries the sample options are used.
// Gemini = the model chain (_shared/geminiChain.ts): best model first, used-up models
// skipped until midnight Pacific, the retry on the next model. Every model busy for
// the minute -> { busy: true } (the app shows "Our AI is busy right now" + Try again);
// every model used up -> sample options with a note. Saved options are never made
// again: once the trip has options this answers 409.
//
// POST { tripId }  ->  { options: TripOptionDraft[], source: 'ai' | 'sample', note, reason?, busy?, model, googleCalls }
// (note: why the options can't fit everyone; reason: why Gemini wasn't used; model: the one that answered)
// Only signed-in members of the trip may call it (Authorization: Bearer <user JWT>).

import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, googleDeps, json, makeGeminiChain, requireMember } from '../_shared/edge.ts';
import { findLandmarkPhoto } from '../_shared/google.ts';
import { planTripOptions, type MemberAnswers, type TripOptionsRequest } from '../_shared/tripOptions.ts';

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

  const [{ data: trip, error: tripError }, { data: prefs, error: prefsError }, { count }, { count: saved }] = await Promise.all([
    db.from('trips').select('*').eq('id', who.tripId).single(),
    db.from('preferences').select('*').eq('trip_id', who.tripId),
    db.from('members').select('id', { count: 'exact', head: true }).eq('trip_id', who.tripId),
    db.from('trip_options').select('id', { count: 'exact', head: true }).eq('trip_id', who.tripId),
  ]);
  if (tripError || !trip) return json({ error: 'Trip not found' }, 404);
  if (prefsError) return json({ error: prefsError.message }, 500);
  if ((saved ?? 0) > 0) return json({ error: 'This trip already has its options' }, 409);

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

  const chain = geminiKey ? makeGeminiChain(admin, geminiKey, Deno.env.get('GEMINI_MODELS'), 0.8, log) : null;
  const result = await planTripOptions(request, {
    ask: chain ? (prompt) => chain.ask(prompt) : null,
    findPhoto: google ? (landmark) => findLandmarkPhoto(google, landmark) : null,
    log,
  });
  const model = result.source === 'ai' ? chain?.model ?? null : null;
  console.log(`generate-trip-options trip ${who.tripId}: ${model ? `answered by ${model}` : result.busy ? 'every model busy' : `sample options (${result.reason})`}`);
  return json({ ...result, model });
});
