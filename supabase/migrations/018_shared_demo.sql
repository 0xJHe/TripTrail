-- 018 Shared Demo mode: one demo per trip, the same on every member's phone.
-- Paste into Supabase > SQL Editor > Run (once, after 017). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

-- The trip's demo: on/off, the shared fake clock, the day and the last event reached.
-- Members can read it; it only changes through the demo_* functions below, which check
-- membership and `step` (a tap only applies if it saw the latest step, so two taps at
-- the same moment make one step).
create table if not exists demo_sessions (
  trip_id uuid primary key references trips(id) on delete cascade,
  enabled boolean not null default false,
  fake_time timestamptz,         -- the fake clock; null = not set yet (the real time)
  day int,                       -- the trip day being replayed
  event_at timestamptz,          -- the last demo event reached (fake time), null = none
  start_time timestamptz,        -- Day 1's replay start: Reset goes back here
  step int not null default 0,   -- +1 on every change
  reset_at timestamptz,          -- real time of the last Reset (phones clear their own Keep going)
  updated_by uuid references members(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table demo_sessions enable row level security;
drop policy if exists "demo read" on demo_sessions;
create policy "demo read" on demo_sessions for select using (is_member(trip_id));

-- Demo mode: each real member's own phone battery (their position is pretend, their
-- battery is real). Never positions: Demo mode doesn't write to `locations`.
create table if not exists demo_batteries (
  member_id uuid primary key references members(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  battery int not null check (battery between 0 and 100),
  updated_at timestamptz not null default now()
);
create index if not exists demo_batteries_trip_idx on demo_batteries (trip_id);
alter table demo_batteries enable row level security;
drop policy if exists "demo batteries read" on demo_batteries;
drop policy if exists "demo batteries insert own" on demo_batteries;
drop policy if exists "demo batteries update own" on demo_batteries;
create policy "demo batteries read" on demo_batteries for select using (is_member(trip_id));
create policy "demo batteries insert own" on demo_batteries for insert with check (
  exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = demo_batteries.trip_id));
create policy "demo batteries update own" on demo_batteries for update
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid()))
  with check (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = demo_batteries.trip_id));

-- This caller's member id in the trip, or an error.
create or replace function demo_member(p_trip uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  me uuid;
begin
  select id into me from members where trip_id = p_trip and user_id = auth.uid();
  if me is null then raise exception 'Not a member of this trip'; end if;
  return me;
end $$;

-- Turn Demo mode on or off for the whole trip. Already that way = nothing changes (two
-- phones turning it on together don't restart it). On: the clock is set by demo_init once a
-- phone has the Day plan. Off: everything cleared, so turning it on again starts at Day 1.
create or replace function demo_set_enabled(p_trip uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := demo_member(p_trip);
  s demo_sessions%rowtype;
begin
  insert into demo_sessions (trip_id) values (p_trip) on conflict (trip_id) do nothing;
  select * into s from demo_sessions where trip_id = p_trip for update;
  if s.enabled = p_on then
    return jsonb_build_object('applied', false, 'session', to_jsonb(s));
  end if;
  update demo_sessions set enabled = p_on, fake_time = null, day = null, event_at = null, start_time = null,
         step = step + 1, updated_by = me, updated_at = now()
   where trip_id = p_trip returning * into s;
  return jsonb_build_object('applied', true, 'session', to_jsonb(s));
end $$;

-- Start the clock at Day 1's replay start, only if no phone has yet.
create or replace function demo_init(p_trip uuid, p_start timestamptz, p_day int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := demo_member(p_trip);
  s demo_sessions%rowtype;
begin
  update demo_sessions set fake_time = p_start, start_time = p_start, day = p_day, event_at = null,
         step = step + 1, updated_by = me, updated_at = now()
   where trip_id = p_trip and enabled and fake_time is null returning * into s;
  if found then return jsonb_build_object('applied', true, 'session', to_jsonb(s)); end if;
  select * into s from demo_sessions where trip_id = p_trip;
  return jsonb_build_object('applied', false, 'session', to_jsonb(s));
end $$;

-- One tap of +15 min / Next event / Next day: applies only if the phone saw the latest
-- step; otherwise someone else's tap won and the current state comes back unchanged.
create or replace function demo_step(p_trip uuid, p_step int, p_fake_time timestamptz, p_day int, p_event_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := demo_member(p_trip);
  s demo_sessions%rowtype;
begin
  update demo_sessions set fake_time = p_fake_time, day = p_day, event_at = p_event_at,
         step = step + 1, updated_by = me, updated_at = now()
   where trip_id = p_trip and enabled and step = p_step returning * into s;
  if found then return jsonb_build_object('applied', true, 'session', to_jsonb(s)); end if;
  select * into s from demo_sessions where trip_id = p_trip;
  return jsonb_build_object('applied', false, 'session', to_jsonb(s));
end $$;

-- Reset, once for the whole trip (same step rule): undoes everything at or after the fake
-- start time (rain, running-early and running-late cards with the stops they changed,
-- visits, spend answers and extra spends, Done for today, meet points and splits with group
-- B's stops, pins) and puts the clock back to the start. Returns the removed pins' photo
-- paths: the phone deletes those files (storage policy "pin photos delete orphan").
create or replace function demo_reset(p_trip uuid, p_step int, p_start timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := demo_member(p_trip);
  s demo_sessions%rowtype;
  t timestamptz;
  photos jsonb;
begin
  select * into s from demo_sessions where trip_id = p_trip for update;
  if not found or not s.enabled or s.step <> p_step then
    return jsonb_build_object('applied', false, 'session', to_jsonb(s), 'photos', '[]'::jsonb);
  end if;
  t := least(coalesce(s.start_time, p_start), coalesce(p_start, s.start_time));
  if t is null then
    return jsonb_build_object('applied', false, 'session', to_jsonb(s), 'photos', '[]'::jsonb);
  end if;

  -- Latest kind first (rain after early after late in a demo day), so the oldest times win.
  perform undo_rain_alerts(p_trip, t);
  perform undo_early_alerts(p_trip, t);
  perform undo_late_alerts(p_trip, t);
  -- Visits after t: arrived after -> planned again; left after -> arrived again.
  update stops set status = 'planned', arrived_at = null, left_at = null where trip_id = p_trip and arrived_at > t;
  update stops set status = 'arrived', left_at = null where trip_id = p_trip and left_at > t;
  delete from spends where trip_id = p_trip and answered_at >= t;
  delete from day_closures where trip_id = p_trip and closed_at >= t;
  delete from meet_points where trip_id = p_trip and set_at >= t; -- group B's stops go with them
  select coalesce(jsonb_agg(photo_url), '[]'::jsonb) into photos
    from pins where trip_id = p_trip and created_at >= t and photo_url is not null;
  update pins set deleted_at = now() where trip_id = p_trip and created_at >= t; -- Realtime sees it
  delete from pins where trip_id = p_trip and created_at >= t;

  update demo_sessions set fake_time = coalesce(p_start, t), start_time = coalesce(p_start, t), day = null,
         event_at = null, step = step + 1, reset_at = now(), updated_by = me, updated_at = now()
   where trip_id = p_trip returning * into s;
  return jsonb_build_object('applied', true, 'session', to_jsonb(s), 'photos', photos);
end $$;

revoke execute on function demo_member(uuid) from public, anon;
revoke execute on function demo_set_enabled(uuid, boolean) from public, anon;
revoke execute on function demo_init(uuid, timestamptz, int) from public, anon;
revoke execute on function demo_step(uuid, int, timestamptz, int, timestamptz) from public, anon;
revoke execute on function demo_reset(uuid, int, timestamptz) from public, anon;
grant execute on function demo_member(uuid) to authenticated;
grant execute on function demo_set_enabled(uuid, boolean) to authenticated;
grant execute on function demo_init(uuid, timestamptz, int) to authenticated;
grant execute on function demo_step(uuid, int, timestamptz, int, timestamptz) to authenticated;
grant execute on function demo_reset(uuid, int, timestamptz) to authenticated;

-- Reset removes other members' demo pins too: a member may delete a photo in their trip's
-- folder once no pin uses it any more.
drop policy if exists "pin photos delete orphan" on storage.objects;
create policy "pin photos delete orphan" on storage.objects for delete to authenticated
  using (bucket_id = 'pin-photos' and public.is_member(((storage.foldername(name))[1])::uuid)
    and not exists (select 1 from public.pins p where p.photo_url = objects.name));

-- Realtime (re-running: "already member of publication" can be ignored).
do $$ begin
  alter publication supabase_realtime add table demo_sessions, demo_batteries;
exception when duplicate_object then null;
end $$;
