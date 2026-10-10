-- 011 Meet point and Split & rejoin.
-- Paste into Supabase > SQL Editor > Run (once, after 010). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.
-- meet_points itself already exists and is already in the Realtime publication.

-- One row per meet point or split. The newest row of each kind set today is the current one.
--   kind 'meet'  = a meet point (lat/lng, name).
--   kind 'split' = Split & rejoin: group_b goes to the rejoin stop (stop_id, lat/lng, name)
--                  by rejoin_at; everyone else (group A) keeps the plan.
-- status: active | together (everyone got there) | cleared (ended by hand).
-- set_at / ended_at are the phone's now() (the fake time in Demo mode), so jumping the demo
-- clock back hides meet points set "later" and brings back ones ended "later".
alter table meet_points add column if not exists kind text not null default 'meet';
alter table meet_points add column if not exists name text;
alter table meet_points add column if not exists stop_id uuid references stops(id) on delete set null;
alter table meet_points add column if not exists group_b jsonb not null default '[]'::jsonb; -- [{ "id", "name" }]
alter table meet_points add column if not exists set_at timestamptz not null default now();
alter table meet_points add column if not exists status text not null default 'active';
alter table meet_points add column if not exists ended_at timestamptz;
alter table meet_points add column if not exists ended_by uuid references members(id) on delete set null;
create index if not exists meet_points_trip_idx on meet_points (trip_id, set_at desc);

-- Members may add, read and end the trip's meet points (the "meet all" policy covers it).
drop policy if exists "meet all" on meet_points;
create policy "meet all" on meet_points for all using (is_member(trip_id)) with check (is_member(trip_id));
