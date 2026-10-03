// generate-trip-options: reads the trip and everyone's answers, asks Gemini for 4–5
// trip options that fit the group, and returns them in the shape lib/ai.ts uses.
// Gemini gets two tries; after that the sample options are returned, so the app
// always gets something it can show.
//
// POST { tripId }  ->  { options: TripOptionDraft[], source: 'ai' | 'sample', reason? }
// (reason: why Gemini wasn't used, only when source is 'sample')
// Only signed-in members of the trip may call it (Authorization: Bearer <user JWT>).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

import {
  SCENES,
  sampleTripOptions,
  type MemberAnswers,
  type TripOptionDraft,
  type TripOptionsRequest,
} from '../_shared/tripOptions.ts';

// The retry uses a lighter model, in case the first one is busy (503) or gone (404).
const MODELS = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest',
  Deno.env.get('GEMINI_FALLBACK_MODEL') ?? 'gemini-flash-lite-latest',
];
const MIN_OPTIONS = 4;
const MAX_OPTIONS = 5;

const MUST_HAVES = ['Beach', 'Street food', 'Famous sights', 'Nightlife', 'Shopping', 'Nature', 'Museums', 'Cafés', 'Adventure'];
const NO_GOS = ['Early mornings', 'Late nights', 'Long hikes'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const OptionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  days: z.number().int().min(1).max(14),
  costPerPerson: z.number().positive().max(100000),
  tags: z.array(z.string().trim().min(1)).min(1).max(4),
  covers: z.array(z.string()),
  avoids: z.array(z.string()),
  halal: z.boolean(),
  scene: z.enum(SCENES as [string, ...string[]]),
  dayTitles: z.array(z.string().trim().min(1)).min(1),
});
const AnswerSchema = z.object({ options: z.array(OptionSchema).min(MIN_OPTIONS) });

/** Check Gemini's answer and tidy it to the trip's rules. Throws if it can't be used. */
function parseOptions(text: string, req: TripOptionsRequest): TripOptionDraft[] {
  const parsed = AnswerSchema.parse(JSON.parse(text));
  return parsed.options.slice(0, MAX_OPTIONS).map((o) => {
    const days = Math.min(req.lengthMax, Math.max(req.lengthMin, o.days));
    if (o.dayTitles.length < days) throw new Error(`"${o.name}" has ${o.dayTitles.length} day titles for ${days} days`);
    return {
      name: o.name,
      days,
      costPerPerson: Math.round(o.costPerPerson / 10) * 10,
      tags: o.tags.slice(0, 3),
      // Keep only the app's own words so the fit checks can match them.
      covers: o.covers.filter((c) => MUST_HAVES.includes(c)),
      avoids: o.avoids.filter((a) => NO_GOS.includes(a)),
      halal: o.halal,
      scene: o.scene as TripOptionDraft['scene'],
      dayTitles: o.dayTitles.slice(0, days),
    };
  });
}

/** Dates every member who answered is free on. */
function commonFreeDates(lists: string[][]): string[] {
  if (lists.length === 0) return [];
  return lists[0].filter((d) => lists.every((l) => l.includes(d))).sort();
}

function buildPrompt(req: TripOptionsRequest, trip: Record<string, unknown>, freeDates: string[]): string {
  const where = req.destination
    ? `The group already chose the destination: ${req.destination}. Give ${MIN_OPTIONS} or ${MAX_OPTIONS} different styles of trip there (e.g. highlights, easy pace, budget, food-focused). Each name must include "${req.destination}".`
    : `The group has not chosen a destination. Suggest ${MIN_OPTIONS} or ${MAX_OPTIONS} different destinations reachable from Malaysia (Malaysia, Singapore, Thailand, Indonesia etc.). Each name is just the place, e.g. "Penang".`;
  const when = freeDates.length
    ? `Dates everyone is free: ${freeDates.join(', ')}.`
    : trip.month
      ? `Planned month: ${trip.month}.`
      : 'Dates not decided yet.';
  const members = req.members
    .map(
      (m, i) =>
        `Member ${i + 1}: daily budget ${m.dailyBudget != null ? `RM ${m.dailyBudget}` : 'not set'}; food needs: ${m.foodNeeds.join(', ') || 'none'}; must-haves: ${m.mustHaves.join(', ') || 'none'}; no-go: ${m.noGo ?? 'none'}.`,
    )
    .join('\n');

  return `You plan group trips for a travel app used in Malaysia. Prices are in Malaysian ringgit (RM).

${where}
Trip length: ${req.lengthMin === req.lengthMax ? `${req.lengthMax} days` : `${req.lengthMin} to ${req.lengthMax} days`}.
${when}

What each member answered:
${members}

Rules:
- Fit the whole group: stay within the smallest daily budget where you can, cover as many must-haves as possible, never plan around anyone's no-go, and respect food needs (if anyone needs Halal, prefer places with easy halal food and set "halal" honestly).
- Options must be clearly different from each other.
- "days": a whole number from ${req.lengthMin} to ${req.lengthMax}.
- "costPerPerson": realistic total in RM per person for the whole trip (stay, food, transport within the place, activities), excluding flights.
- "tags": 3 short labels (1–2 words each) shown on the card.
- "covers": which of these the trip offers, using these exact words only: ${MUST_HAVES.join(', ')}.
- "avoids": which of these no-gos the trip would force on people, exact words only: ${NO_GOS.join(', ')}. Empty if none.
- "scene": the picture for the card, one of: ${SCENES.join(', ')}.
- "dayTitles": one short title per day (exactly "days" titles), e.g. "Penang Hill & George Town".

Reply with JSON only, no other text, in this shape:
{"options":[{"name":"","days":3,"costPerPerson":400,"tags":[],"covers":[],"avoids":[],"halal":true,"scene":"temple","dayTitles":[]}]}`;
}

async function askGemini(model: string, prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) throw new Error('Gemini returned no text');
  return text;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  // 1. Signed in?
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in' }, 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ error: 'Not signed in' }, 401);

  let tripId: unknown;
  try {
    tripId = (await req.json())?.tripId;
  } catch {
    return json({ error: 'Body must be JSON: { tripId }' }, 400);
  }
  if (typeof tripId !== 'string' || !tripId) return json({ error: 'tripId is required' }, 400);

  // 2. A member of this trip? (Reads below also go through RLS as this user.)
  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!member) return json({ error: 'Not a member of this trip' }, 403);

  // 3. The trip and everyone's answers.
  const [{ data: trip, error: tripError }, { data: prefs, error: prefsError }] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).single(),
    supabase.from('preferences').select('*').eq('trip_id', tripId),
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
  const request: TripOptionsRequest = {
    destination: trip.destination ?? null,
    lengthMin: trip.length_min ?? trip.length_days ?? 2,
    lengthMax: trip.length_days ?? 3,
    members,
  };
  if (request.lengthMin > request.lengthMax) request.lengthMin = request.lengthMax;

  // 4. Ask Gemini (two tries), else the sample options.
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  let reason = 'GEMINI_API_KEY is not set';
  if (apiKey) {
    const prompt = buildPrompt(request, trip, commonFreeDates(used.map((p) => p.free_dates ?? [])));
    for (const [attempt, model] of MODELS.entries()) {
      try {
        const options = parseOptions(await askGemini(model, prompt, apiKey), request);
        return json({ options, source: 'ai' });
      } catch (e) {
        reason = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        console.error(`generate-trip-options attempt ${attempt + 1} failed:`, reason);
      }
    }
  } else {
    console.error(reason);
  }
  return json({ options: sampleTripOptions(request), source: 'sample', reason });
});
