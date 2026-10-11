-- 014 Gemini model chain.
-- Paste into Supabase > SQL Editor > Run (once, after 013). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

-- Gemini models used up for today (daily free quota reached, or "not found" / "not
-- available"). generate-trip-options and generate-itinerary skip a model here until
-- `until` (the next midnight Pacific time, when Google resets free limits). A model
-- that is only rate limited for the minute is never written here.
-- Only the Edge Functions use it (service role): RLS is on with no policies.
create table if not exists gemini_used_up (
  model text primary key,          -- e.g. 'gemini-3.8-flash'
  until timestamptz not null,      -- skip it until then
  reason text,                     -- Google's error, shortened
  marked_at timestamptz not null default now()
);
alter table gemini_used_up enable row level security;
