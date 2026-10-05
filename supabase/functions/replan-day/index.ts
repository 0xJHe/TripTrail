// replan-day: "Ask AI for a better plan" on the running-late card. Gemini re-plans
// the rest of the day from the remaining stops, the time, where the group is, the
// travel time, the budget, food needs (halal if anyone needs it), must-haves and
// no-go. Only one phone asks per late stop: the plan is saved on the late_alerts row
// (everyone sees it through Realtime) and later callers get the saved one.
// Max 5 AI re-plans per trip per day (take_api_call 'ai_replan'). Gemini gets two
// tries; if both fail the reply has plan null and the app keeps the simple plan.
//
// POST { tripId, stopId, now: ISO, here?: { lat, lng }, tzOffset: minutes east of UTC }
//   -> { plan: NewDay | null, note, limited, geminiCalls }
// Only signed-in members of the trip may call it (Authorization: Bearer <user JWT>).

import { createClient } from 'npm:@supabase/supabase-js@2';

import { askGemini, cacheLock, cors, json, readPoint, requireMember, takeApiCall } from '../_shared/edge.ts';
import {
  AI_FAILED_NOTE,
  AI_LIMIT_NOTE,
  dayEndOn,
  remainingFrom,
  replanWithAi,
  type ReplanInput,
  type ReplanReply,
} from '../_shared/replan.ts';

const DAILY_AI_REPLANS = 5;
/** Gemini can take a while: a lock older than this is from a request that died. */
const LOCK_STALE_MS = 90_000;
/** How long another phone waits for the one asking Gemini, reading the saved plan. */
const WAIT_FOR_OTHER_MS = 45_000;
const MIN = 60_000;

// The retry uses a lighter model, in case the first one is busy (503) or gone (404).
const MODELS = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest',
  Deno.env.get('GEMINI_FALLBACK_MODEL') ?? 'gemini-flash-lite-latest',
];

const reply = (r: Partial<ReplanReply>) => json({ plan: null, note: null, limited: false, geminiCalls: 0, ...r });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON: { tripId, stopId, now, here?, tzOffset }' }, 400);
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const who = await requireMember(db, token, body.tripId);
  if (who instanceof Response) return who;
  if (typeof body.stopId !== 'string') return json({ error: 'stopId is required' }, 400);
  const stopId = body.stopId;

  const readAlert = async () =>
    (await db.from('late_alerts').select('*').eq('stop_id', stopId).eq('trip_id', who.tripId).maybeSingle()).data;
  const alert = await readAlert();
  if (!alert) return json({ error: 'No running-late card for this stop' }, 404);
  if (alert.ai_plan) return reply({ plan: alert.ai_plan });

  const log = (m: string) => console.error(m);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const lock = cacheLock(admin, LOCK_STALE_MS);
  const lockKey = `replan:${stopId}`;

  // Someone else in the group is asking right now: wait for their plan.
  if (!(await lock.claim(lockKey))) {
    for (let waited = 0; waited < WAIT_FOR_OTHER_MS; waited += 1500) {
      await new Promise((r) => setTimeout(r, 1500));
      const saved = await readAlert();
      if (saved?.ai_plan) return reply({ plan: saved.ai_plan });
    }
    return reply({ note: AI_FAILED_NOTE });
  }

  try {
    if (!(await takeApiCall(admin, who.tripId, 'ai_replan', DAILY_AI_REPLANS, log))) {
      return reply({ note: AI_LIMIT_NOTE, limited: true });
    }
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      log('GEMINI_API_KEY is not set');
      return reply({ note: AI_FAILED_NOTE });
    }

    const [{ data: stops }, { data: prefs }] = await Promise.all([
      db.from('stops').select('*').eq('trip_id', who.tripId).eq('day_number', alert.day_number),
      db.from('preferences').select('*').eq('trip_id', who.tripId),
    ]);
    const remaining = remainingFrom(stops ?? [], stopId);
    if (remaining.length === 0) return reply({ note: AI_FAILED_NOTE });

    const sentNow = typeof body.now === 'string' ? Date.parse(body.now) : NaN;
    const now = Number.isFinite(sentNow) ? sentNow : Date.now();
    const tz = Number(body.tzOffset);
    const tzOffsetMin = Number.isFinite(tz) && Math.abs(tz) <= 14 * 60 ? Math.round(tz) : 480;
    const answered = (prefs ?? []).filter((p) => p.daily_budget != null || (p.free_dates ?? []).length > 0);
    const budgets = answered.map((p) => Number(p.daily_budget)).filter((b) => b > 0);
    const foodNeeds = [...new Set(answered.flatMap((p) => (p.food_needs ?? []) as string[]))];
    const input: ReplanInput = {
      now,
      arriveAt: now + alert.travel_min * MIN,
      travelMin: alert.travel_min,
      here: readPoint(body.here),
      stops: remaining,
      dayEndsAt: dayEndOn(remaining[0].start, tzOffsetMin),
      tzOffsetMin,
      dailyBudget: budgets.length ? Math.min(...budgets) : null,
      halal: foodNeeds.includes('Halal'),
      foodNeeds,
      mustHaves: [...new Set(answered.flatMap((p) => (p.must_haves ?? []) as string[]))],
      noGo: [...new Set(answered.map((p) => p.no_go).filter((n): n is string => !!n))],
    };

    const result = await replanWithAi(input, {
      ask: (prompt, attempt) => askGemini(MODELS[attempt] ?? MODELS[0], prompt, geminiKey, 0.4),
      log,
    });
    if (!result.plan) return reply({ note: AI_FAILED_NOTE, geminiCalls: result.geminiCalls });

    // Save it for the whole group (Realtime shows it on everyone's card).
    const { error } = await db
      .from('late_alerts')
      .update({ ai_plan: result.plan })
      .eq('stop_id', stopId)
      .is('ai_plan', null);
    if (error) log(`saving the AI plan failed: ${error.message}`);
    return reply({ plan: result.plan, geminiCalls: result.geminiCalls });
  } finally {
    await lock.release(lockKey);
  }
});
