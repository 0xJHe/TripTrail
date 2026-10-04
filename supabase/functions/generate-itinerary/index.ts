// generate-itinerary: plans every day of the chosen trip with Gemini, from the
// trip dates and everyone's answers (budget, food needs, must-haves, no-go),
// then gets each stop's real address, location and place ID from Google Places
// (cache first, max 60 Google calls per trip per day). Gemini gets two tries;
// after that the sample plan is used, so the app always gets a plan.
//
// POST { tripId, optionId, start? }  ->  { stops: StopDraft[], source: 'ai' | 'sample', note, googleCalls }
// Only signed-in members of the trip may call it (Authorization: Bearer <user JWT>).

import { createClient } from 'npm:@supabase/supabase-js@2';

import { askGemini, cors, googleDeps, json, requireMember } from '../_shared/edge.ts';
import { findStopPlace } from '../_shared/google.ts';
import { planItinerary, type ItineraryInput } from '../_shared/itinerary.ts';

// The retry uses a lighter model, in case the first one is busy (503) or gone (404).
const MODELS = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest',
  Deno.env.get('GEMINI_FALLBACK_MODEL') ?? 'gemini-flash-lite-latest',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  let body: { tripId?: unknown; optionId?: unknown; start?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON: { tripId, optionId, start? }' }, 400);
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const who = await requireMember(db, token, body.tripId);
  if (who instanceof Response) return who;
  if (typeof body.optionId !== 'string') return json({ error: 'optionId is required' }, 400);

  const [{ data: trip }, { data: option }, { data: prefs }] = await Promise.all([
    db.from('trips').select('*').eq('id', who.tripId).single(),
    db.from('trip_options').select('*').eq('id', body.optionId).eq('trip_id', who.tripId).maybeSingle(),
    db.from('preferences').select('*').eq('trip_id', who.tripId),
  ]);
  if (!trip || !option) return json({ error: 'Trip or option not found' }, 404);

  const answered = (prefs ?? []).filter((p) => p.daily_budget != null || (p.free_dates ?? []).length > 0);
  const members = answered.map((p) => ({
    dailyBudget: p.daily_budget != null ? Number(p.daily_budget) : null,
    foodNeeds: p.food_needs ?? [],
    mustHaves: p.must_haves ?? [],
    noGo: p.no_go ?? null,
  }));
  const days = Number(option.plan_json?.days) || trip.length_days || 3;
  const budgets = members.map((m) => m.dailyBudget).filter((b): b is number => b != null && b > 0);
  const start = typeof body.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.start) ? body.start : trip.start_date;
  const input: ItineraryInput = {
    destination: option.name,
    days,
    dayTitles: option.plan_json?.dayTitles ?? [],
    halal: members.some((m) => m.foodNeeds.includes('Halal')),
    startDate: start ?? null,
    members,
    budget: budgets.length ? Math.min(...budgets) * days : null,
  };

  const log = (m: string) => console.error(m);
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const google = googleKey ? googleDeps(admin, googleKey, who.tripId, log) : null;
  if (!geminiKey) log('GEMINI_API_KEY is not set');
  if (!googleKey) log('GOOGLE_MAPS_API_KEY is not set');

  const result = await planItinerary(input, {
    ask: geminiKey ? (prompt, attempt) => askGemini(MODELS[attempt] ?? MODELS[0], prompt, geminiKey) : null,
    findPlace: google ? (query, near) => findStopPlace(google, query, near) : null,
    log,
  });
  return json(result);
});
