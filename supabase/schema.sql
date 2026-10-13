-- TripTrail — Supabase schema. Paste into Supabase > SQL Editor > Run.

create extension if not exists "pgcrypto";

create table trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  destination text,
  month text,
  length_min int, -- trip length is a range ("2 – 3 days"): length_min .. length_days
  length_days int,
  dates_fixed boolean default false,
  start_date date,
  end_date date,
  join_code text unique not null,
  created_by uuid references auth.users(id),
  winning_option_id uuid,
  stage text not null default 'preferences', -- preferences | voting | decided
  created_at timestamptz default now(),
  members_changed_at timestamptz, -- set when someone leaves (Realtime: the member list updates live)
  -- Try a demo trip: a copy made by start_demo_trip points at its template (null = a normal
  -- trip). Copies are private: nobody can join them by code.
  demo_of uuid references trips(id) on delete set null
);

create table members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  user_id uuid references auth.users(id),
  display_name text not null,
  avatar_color text,
  joined_at timestamptz default now(),
  chosen_option_id uuid, -- trip picked on the Results screen (FK added after trip_options)
  -- A made-up member (marked "(demo)" in the name): no account (user_id null), never a real
  -- person. The app leaves them out of every "real member" count.
  is_demo boolean not null default false,
  unique (trip_id, user_id)
);

create table preferences (
  member_id uuid primary key references members(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade, -- for Realtime filters
  daily_budget numeric,
  free_dates date[] default '{}',
  food_needs text[] default '{}',
  must_haves text[] default '{}',
  no_go text,
  updated_at timestamptz default now()
);

create table trip_options (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  name text not null,
  cost_per_person numeric,
  start_date date,
  end_date date,
  tags text[] default '{}',
  summary text,
  fits_everyone boolean default false,
  plan_json jsonb,
  position int not null default 0, -- order the options were generated in
  created_at timestamptz default now()
);

create table votes (
  member_id uuid references members(id) on delete cascade,
  option_id uuid references trip_options(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade, -- for Realtime filters
  liked boolean not null,
  primary key (member_id, option_id)
);
alter table members add constraint members_chosen_option_fk
  foreign key (chosen_option_id) references trip_options(id) on delete set null;
create index preferences_trip_idx on preferences (trip_id);
create index votes_trip_idx on votes (trip_id);

create table stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  day_number int not null,
  position int not null,
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  planned_time timestamptz,
  planned_end timestamptz,
  price numeric default 0,
  is_estimate boolean default true,
  is_booked boolean default false,
  is_outdoor boolean default false,
  tip text,
  status text default 'planned', -- planned | arrived | done | dropped
  arrived_at timestamptz,
  left_at timestamptz,
  actual_cost numeric,
  category text, -- flight | hotel | sight | food | beach | shopping
  priority int default 2, -- 1 = drop first when re-planning, 3 = keep
  note text,
  halal_available boolean,
  place_id text -- Google place ID (from generate-itinerary or the Add a stop search)
);

create table locations (
  id bigserial primary key,
  member_id uuid references members(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  battery int,
  recorded_at timestamptz default now()
);
create index on locations (trip_id, recorded_at desc);

-- Spend check: one answer per person per stop per day to "About RM 16 spent?" (booked
-- stops: "Spent anything extra?", the amount on top of the booking). ✓ = confirmed with the
-- guess; an amount typed in = confirmed false; skipped keeps the guess.
-- Extra spends ("+ Add spend" on the Plan tab): no stop, a day and an optional note.
create table spends (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade, -- for Realtime filters
  stop_id uuid references stops(id) on delete cascade, -- null = extra spend
  member_id uuid references members(id) on delete cascade,
  day_number int not null, -- the trip day it counts on
  amount numeric not null,
  confirmed boolean default true,
  skipped boolean not null default false,
  note text, -- extra spends: "Grab to hotel"
  answered_at timestamptz not null default now(), -- the phone's now() (the fake time in Demo mode)
  created_at timestamptz default now()
);
create index spends_trip_idx on spends (trip_id);
create unique index spends_stop_member_day_key on spends (stop_id, member_id, day_number);

create table pins (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  type text not null, -- spot | vehicle
  name text,
  lat double precision not null,
  lng double precision not null,
  photo_url text,
  created_at timestamptz default now(),
  -- Set just before the row is deleted, so Realtime (filtered by trip_id) tells everyone.
  deleted_at timestamptz
);

-- Meet point and Split & rejoin: one row each; the newest of each kind set today is the
-- current one. kind 'meet' = a meet point; 'split' = group_b heads to the rejoin stop
-- (stop_id) by rejoin_at, everyone else keeps the plan. status: active | together
-- (everyone got there) | cleared (ended by hand). set_at / ended_at are the phone's now()
-- (the fake time in Demo mode).
create table meet_points (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  set_by uuid references members(id) on delete set null,
  kind text not null default 'meet', -- meet | split
  name text, -- stop / pin name; null = a spot tapped on the map
  lat double precision not null,
  lng double precision not null,
  stop_id uuid references stops(id) on delete set null, -- split: the rejoin stop
  rejoin_at timestamptz,
  group_b jsonb not null default '[]'::jsonb, -- split: [{ "id", "name" }]
  set_at timestamptz not null default now(),
  status text not null default 'active',
  ended_at timestamptz,
  ended_by uuid references members(id) on delete set null,
  active boolean default true,
  created_at timestamptz default now()
);
create index meet_points_trip_idx on meet_points (trip_id, set_at desc);

-- Split & rejoin: group B's own stops ("+ Add a stop" during a split). A stop with split_id
-- belongs to that split's group B only (shown, ticked off and spend-checked only for them);
-- null = the shared plan. Removing the split removes its stops.
alter table stops add column split_id uuid references meet_points(id) on delete cascade;
create index stops_split_idx on stops (split_id) where split_id is not null;

-- "Done for today": one row per person per trip day. Reopening sets closed = false (an update,
-- so Realtime reaches everyone). closed_at = the phone's now() (the fake time in Demo mode).
create table day_closures (
  trip_id uuid not null references trips(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  day_number int not null,
  closed boolean not null default true,
  closed_at timestamptz default now(),
  primary key (member_id, day_number)
);
create index day_closures_trip_idx on day_closures (trip_id);

-- Row Level Security: members of a trip can see and change that trip's rows.
alter table trips enable row level security;
alter table members enable row level security;
alter table preferences enable row level security;
alter table trip_options enable row level security;
alter table votes enable row level security;
alter table stops enable row level security;
alter table locations enable row level security;
alter table spends enable row level security;
alter table pins enable row level security;
alter table meet_points enable row level security;
alter table day_closures enable row level security;

create or replace function is_member(t uuid) returns boolean
language sql stable security definer as $$
  select exists (select 1 from members where trip_id = t and user_id = auth.uid());
$$;

-- trips: anyone signed in can create; members can read/update; join by code is done
-- through a security-definer function so the code never exposes other trips.
create policy "trips insert" on trips for insert with check (auth.uid() = created_by);
create policy "trips read" on trips for select using (is_member(id));
-- The creator can read the trip they just inserted, before their members row exists.
create policy "trips read own" on trips for select using (created_by = auth.uid());
create policy "trips update" on trips for update using (is_member(id));

create policy "members read" on members for select using (is_member(trip_id));
create policy "members insert self" on members for insert with check (user_id = auth.uid());
create policy "members update self" on members for update using (user_id = auth.uid());

create policy "prefs all" on preferences for all
  using (exists (select 1 from members m where m.id = member_id and is_member(m.trip_id)));

create policy "options all" on trip_options for all using (is_member(trip_id));
create policy "votes all" on votes for all
  using (exists (select 1 from members m where m.id = member_id and is_member(m.trip_id)));
create policy "stops all" on stops for all using (is_member(trip_id));
create policy "locations all" on locations for all using (is_member(trip_id));
create policy "spends read" on spends for select using (is_member(trip_id));
create policy "spends insert own" on spends for insert with check (
  exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = spends.trip_id)
  and (stop_id is null or exists (select 1 from stops s where s.id = stop_id and s.trip_id = spends.trip_id)));
create policy "spends update own" on spends for update
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid()))
  with check (
    exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = spends.trip_id)
    and (stop_id is null or exists (select 1 from stops s where s.id = stop_id and s.trip_id = spends.trip_id)));
create policy "spends delete own" on spends for delete
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid()));
-- Everyone in the trip sees its pins; only the person who pinned one can change or delete it.
create policy "pins read" on pins for select using (is_member(trip_id));
create policy "pins insert own" on pins for insert with check (
  exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = pins.trip_id));
create policy "pins update own" on pins for update
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid()))
  with check (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = pins.trip_id));
create policy "pins delete own" on pins for delete
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid()));
create policy "meet all" on meet_points for all using (is_member(trip_id)) with check (is_member(trip_id));
create policy "closures read" on day_closures for select using (is_member(trip_id));
create policy "closures insert own" on day_closures for insert with check (
  exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = day_closures.trip_id));
create policy "closures update own" on day_closures for update
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid()))
  with check (
    exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = day_closures.trip_id));

-- Try a demo trip (migration 019).
-- The hidden demo templates: trips with no real members (so nobody can read them through RLS),
-- copied by start_demo_trip. Only the SQL editor (or service role) can add one: RLS on, no policies.
create table demo_templates (
  trip_id uuid primary key references trips(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table demo_templates enable row level security;

-- The app can't mark trips as demo copies or members as made-up: only the functions below
-- (security definer, run as the owner) can. A client's insert gets the defaults, an update keeps the old value.
create or replace function lock_demo_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_table_name = 'trips' then
      new.demo_of := case when tg_op = 'UPDATE' then old.demo_of else null end;
    else
      new.is_demo := case when tg_op = 'UPDATE' then old.is_demo else false end;
    end if;
  end if;
  return new;
end $$;
create trigger trips_lock_demo before insert or update on trips for each row execute function lock_demo_fields();
create trigger members_lock_demo before insert or update on members for each row execute function lock_demo_fields();

-- Join a trip by code (bypasses RLS safely). Codes are typed by hand, so match case-insensitively.
-- Demo templates and demo copies can't be joined (a copy belongs to one person).
create or replace function join_trip(code text, name text, color text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select id into t from trips
   where join_code = lower(trim(code))
     and demo_of is null
     and not exists (select 1 from demo_templates d where d.trip_id = trips.id);
  if t is null then raise exception 'Invalid join code'; end if;
  insert into members (trip_id, user_id, display_name, avatar_color)
  values (t, auth.uid(), name, nullif(color, ''))
  on conflict (trip_id, user_id) do update set display_name = excluded.display_name;
  return t;
end $$;

-- True when I'm the trip's only real member (about to delete it by leaving).
create or replace function is_only_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where trip_id = t and user_id = auth.uid())
     and (select count(*) from members where trip_id = t and not is_demo) = 1;
$$;

-- Leave a trip: removes my member row (my preferences, votes, spends, pins, positions and
-- closures go with it). The organiser role passes to the real member who joined earliest. The
-- last real member deletes the trip and everything in it (made-up members too). Returns 'left' or 'deleted'.
create or replace function leave_trip(p_trip uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  t trips%rowtype;
  me uuid;
  next_user uuid;
begin
  select * into t from trips where id = p_trip for update; -- one leave at a time per trip
  if not found then raise exception 'That trip is gone'; end if;
  select id into me from members where trip_id = p_trip and user_id = auth.uid();
  if me is null then raise exception 'Not a member of this trip'; end if;

  delete from members where id = me;

  if not exists (select 1 from members where trip_id = p_trip and not is_demo) then
    -- Picks the nearby-suggestion function saved per stop (the rest of google_cache isn't per trip).
    delete from google_cache
     where key in (select 'nearby-pick:' || s.id from stops s where s.trip_id = p_trip
                   union all
                   select 'rain-pick:' || s.id from stops s where s.trip_id = p_trip);
    delete from trips where id = p_trip; -- cascades to every table with a trip_id
    return 'deleted';
  end if;

  if not exists (select 1 from members where trip_id = p_trip and user_id = t.created_by) then
    select user_id into next_user from members where trip_id = p_trip and not is_demo
     order by joined_at asc, id asc limit 1;
  end if;
  update trips
     set created_by = coalesce(next_user, created_by), members_changed_at = now()
   where id = p_trip;
  return 'left';
end $$;
revoke execute on function leave_trip(uuid) from public, anon;
grant execute on function leave_trip(uuid) to authenticated;

-- Try a demo trip: a fresh private copy of the newest demo template for the caller only, or
-- their unfinished copy (end date today or later, Malaysia time) if they already have one.
-- The copy: the trip (decided, Day 1 = tomorrow, same length), the full day plan (names,
-- addresses, places, times moved to the new dates, prices, categories, tips; dropped stops and
-- group B stops left out, every stop planned again), the made-up members with their
-- preferences, and the caller as its only real member and organiser. Nothing else: no votes,
-- options, positions, spends, pins, alerts, meet points, closures or demo session.
-- Returns { trip_id, created }.
create or replace function start_demo_trip(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  tpl trips%rowtype;
  existing uuid;
  new_trip uuid;
  shift int;
  code text;
  m members%rowtype;
  made_up uuid;
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  -- One at a time per person, so two quick taps make one copy.
  perform pg_advisory_xact_lock(hashtext('start_demo_trip:' || uid::text));

  select t.id into existing
    from trips t join members me on me.trip_id = t.id and me.user_id = uid
   where t.demo_of is not null and (t.end_date is null or t.end_date >= today)
   order by t.created_at desc limit 1;
  if existing is not null then
    return jsonb_build_object('trip_id', existing, 'created', false);
  end if;

  select t.* into tpl from trips t join demo_templates d on d.trip_id = t.id order by d.created_at desc limit 1;
  if not found or tpl.start_date is null then raise exception 'The demo trip is not set up yet'; end if;
  shift := (today + 1) - tpl.start_date;

  loop
    code := 'demo-' || substr(md5(gen_random_uuid()::text), 1, 6);
    exit when not exists (select 1 from trips where join_code = code);
  end loop;

  insert into trips (name, destination, month, length_min, length_days, dates_fixed, start_date, end_date,
                     join_code, created_by, stage, demo_of)
  values (tpl.name, tpl.destination, to_char(tpl.start_date + shift, 'YYYY-MM'), tpl.length_min, tpl.length_days, true,
          tpl.start_date + shift, tpl.end_date + shift, code, uid, 'decided', tpl.id)
  returning id into new_trip;

  insert into members (trip_id, user_id, display_name)
  values (new_trip, uid, coalesce(nullif(trim(p_name), ''), 'You'));

  -- Made-up members join after the caller (join order), with their preferences (free dates moved too).
  for m in select * from members where trip_id = tpl.id and is_demo order by joined_at, id loop
    insert into members (trip_id, user_id, display_name, avatar_color, is_demo, joined_at)
    values (new_trip, null, m.display_name, m.avatar_color, true, now() + interval '1 second')
    returning id into made_up;
    insert into preferences (member_id, trip_id, daily_budget, free_dates, food_needs, must_haves, no_go)
    select made_up, new_trip, p.daily_budget,
           coalesce((select array_agg(d + shift order by d) from unnest(p.free_dates) d), '{}'),
           p.food_needs, p.must_haves, p.no_go
      from preferences p where p.member_id = m.id;
  end loop;

  insert into stops (trip_id, day_number, position, name, address, lat, lng, planned_time, planned_end,
                     price, is_estimate, is_booked, is_outdoor, tip, category, priority, note, halal_available, place_id)
  select new_trip, s.day_number, s.position, s.name, s.address, s.lat, s.lng,
         s.planned_time + make_interval(days => shift), s.planned_end + make_interval(days => shift),
         s.price, s.is_estimate, s.is_booked, s.is_outdoor, s.tip, s.category, s.priority, s.note, s.halal_available, s.place_id
    from stops s
   where s.trip_id = tpl.id and s.split_id is null and coalesce(s.status, 'planned') <> 'dropped';

  return jsonb_build_object('trip_id', new_trip, 'created', true);
end $$;
revoke execute on function start_demo_trip(text) from public, anon;
grant execute on function start_demo_trip(text) to authenticated;

-- Build the plan once, when every member has chosen the same trip.
-- Locks the trip row so two people tapping "Build the plan" together only build it once.
-- Returns true if this call built the plan, false if it was already built.
create or replace function build_plan(p_trip uuid, p_option uuid, p_start date, p_end date, p_stops jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  t trips%rowtype;
  opt trip_options%rowtype;
begin
  if not is_member(p_trip) then raise exception 'Not a member of this trip'; end if;
  select * into t from trips where id = p_trip for update;
  if t.stage = 'decided' then return false; end if; -- already built
  if exists (select 1 from members where trip_id = p_trip and chosen_option_id is distinct from p_option) then
    raise exception 'Not everyone has chosen this trip yet';
  end if;
  select * into opt from trip_options where id = p_option and trip_id = p_trip;
  if not found then raise exception 'That trip option is gone'; end if;

  insert into stops (trip_id, day_number, position, name, address, lat, lng, planned_time, planned_end,
                     price, is_estimate, is_booked, is_outdoor, tip, category, priority, place_id)
  select p_trip, s.day_number, s.position, s.name, s.address, s.lat, s.lng, s.planned_time, s.planned_end,
         coalesce(s.price, 0), coalesce(s.is_estimate, true), coalesce(s.is_booked, false),
         coalesce(s.is_outdoor, false), s.tip, s.category, coalesce(s.priority, 2), s.place_id
  from jsonb_populate_recordset(null::stops, p_stops) s;

  update trips
     set stage = 'decided', winning_option_id = p_option, destination = opt.name,
         start_date = coalesce(p_start, start_date), end_date = coalesce(p_end, end_date)
   where id = p_trip;
  return true;
end $$;

-- Google Places: every result is cached (including "nothing found") and calls are
-- limited to 60 per trip per day (Malaysia time). Only the Edge Functions use these
-- (service role): RLS is on with no policies.
create table google_cache (
  key text primary key,            -- e.g. 'stop:kek lok si temple, penang' or 'photo:wat arun, bangkok'
  kind text not null,              -- stop | photo | autocomplete | place
  data jsonb not null,
  created_at timestamptz default now()
);
alter table google_cache enable row level security;

create table google_usage (
  trip_id uuid references trips(id) on delete cascade,
  day date not null,
  calls int not null default 0,
  primary key (trip_id, day)
);
alter table google_usage enable row level security;

-- Count one Google call for the trip; false when today's limit is already reached.
create or replace function take_google_call(p_trip uuid, p_limit int default 60)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  used int;
begin
  insert into google_usage (trip_id, day, calls) values (p_trip, today, 1)
  on conflict (trip_id, day) do update set calls = google_usage.calls + 1
    where google_usage.calls < p_limit
  returning calls into used;
  return used is not null;
end $$;
revoke execute on function take_google_call(uuid, int) from public, anon, authenticated;
grant execute on function take_google_call(uuid, int) to service_role;

-- Gemini models used up for today (daily free quota reached, or "not found" / "not
-- available"). generate-trip-options and generate-itinerary skip a model here until
-- `until` (the next midnight Pacific time, when Google resets free limits). A model
-- that is only rate limited for the minute is never written here.
-- Only the Edge Functions use it (service role): RLS is on with no policies.
create table gemini_used_up (
  model text primary key,          -- e.g. 'gemini-3.8-flash'
  until timestamptz not null,      -- skip it until then
  reason text,                     -- Google's error, shortened
  marked_at timestamptz not null default now()
);
alter table gemini_used_up enable row level security;

-- Weather: max 30 Google Weather calls per trip per day (Malaysia time), separate
-- from the Places limit. Only the weather Edge Function uses it (service role).
create table weather_usage (
  trip_id uuid references trips(id) on delete cascade,
  day date not null,
  calls int not null default 0,
  primary key (trip_id, day)
);
alter table weather_usage enable row level security;

create or replace function take_weather_call(p_trip uuid, p_limit int default 30)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  used int;
begin
  insert into weather_usage (trip_id, day, calls) values (p_trip, today, 1)
  on conflict (trip_id, day) do update set calls = weather_usage.calls + 1
    where weather_usage.calls < p_limit
  returning calls into used;
  return used is not null;
end $$;
revoke execute on function take_weather_call(uuid, int) from public, anon, authenticated;
grant execute on function take_weather_call(uuid, int) to service_role;

-- Pin photos: private bucket, one folder per trip ("<trip id>/<file>.jpg"); pins.photo_url keeps the path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pin-photos', 'pin-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "pin photos read" on storage.objects for select to authenticated
  using (bucket_id = 'pin-photos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "pin photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'pin-photos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "pin photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'pin-photos' and owner = auth.uid());
-- The last member deletes every photo in the trip's folder before leaving (Group tab > Leave trip).
create policy "pin photos delete last member" on storage.objects for delete to authenticated
  using (bucket_id = 'pin-photos' and public.is_only_member(((storage.foldername(name))[1])::uuid));

-- Running late (migrations 005, 006).
-- Paid API calls per trip per day (Malaysia time), by kind: 'routes' (max 20, eta
-- function), 'nearby' (max 10, nearby-suggestion function), 'place_search' (max 60 search
-- sessions, place-search function: one session token = 1, however many letters) and
-- 'place_search_calls' (max 600 Google calls inside those sessions, a backstop). Separate
-- from the Places and weather counters. Only the Edge Functions use it (service role): RLS on, no policies.
create table if not exists api_usage (
  trip_id uuid references trips(id) on delete cascade,
  day date not null,
  kind text not null,
  calls int not null default 0,
  primary key (trip_id, day, kind)
);
alter table api_usage enable row level security;

create or replace function take_api_call(p_trip uuid, p_kind text, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  used int;
begin
  insert into api_usage (trip_id, day, kind, calls) values (p_trip, today, p_kind, 1)
  on conflict (trip_id, day, kind) do update set calls = api_usage.calls + 1
    where api_usage.calls < p_limit
  returning calls into used;
  return used is not null;
end $$;
revoke execute on function take_api_call(uuid, text, int) from public, anon, authenticated;
grant execute on function take_api_call(uuid, text, int) to service_role;

-- One running-late card per stop, shared by the group: the first phone that finds the
-- group will be late saves it with the suggested new day (simple rules); everyone sees
-- it through Realtime. Accept / Keep original closes it for everyone.
create table if not exists late_alerts (
  stop_id uuid primary key references stops(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  day_number int not null,
  checked_at timestamptz not null, -- now() of the check (the fake time in Demo mode)
  travel_min int not null,
  travel_source text not null,     -- estimate | google | demo | limited (estimate: a daily limit stopped Google)
  starts_at timestamptz,           -- the stop's planned start when checked
  plan jsonb not null,             -- the suggested new day
  status text not null default 'open', -- open | accepted | kept
  original jsonb,                  -- the stops' times before accepting (Demo mode Reset puts them back)
  decided_by uuid references members(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists late_alerts_trip_idx on late_alerts (trip_id);
alter table late_alerts enable row level security;
drop policy if exists "late alerts all" on late_alerts;
create policy "late alerts all" on late_alerts for all using (is_member(trip_id)) with check (is_member(trip_id));

-- Accept the suggested new day ('rules') or keep the original ('keep'), once for the group.
-- Accepting moves the stops' times and drops stops in one go; everyone's Today and Plan
-- change live through Realtime. Returns false if someone already decided.
create or replace function decide_new_day(p_stop uuid, p_choice text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  a late_alerts%rowtype;
  v_me uuid;
begin
  select * into a from late_alerts where stop_id = p_stop for update;
  if not found then raise exception 'No running-late card for this stop'; end if;
  if not is_member(a.trip_id) then raise exception 'Not a member of this trip'; end if;
  if a.status <> 'open' then return false; end if;
  select id into v_me from members where trip_id = a.trip_id and user_id = auth.uid();

  if p_choice = 'keep' then
    update late_alerts set status = 'kept', decided_by = v_me, decided_at = now() where stop_id = p_stop;
    return true;
  end if;
  if p_choice <> 'rules' then raise exception 'Choose rules or keep'; end if;

  update late_alerts set
    status = 'accepted', decided_by = v_me, decided_at = now(),
    original = (
      select jsonb_agg(jsonb_build_object('id', s.id, 'planned_time', s.planned_time,
                                          'planned_end', s.planned_end, 'status', s.status))
      from stops s join jsonb_to_recordset(a.plan->'items') x("stopId" uuid) on s.id = x."stopId"
      where s.trip_id = a.trip_id)
  where stop_id = p_stop;

  update stops s set planned_time = x.start, planned_end = x."end"
    from jsonb_to_recordset(a.plan->'items') x("stopId" uuid, start timestamptz, "end" timestamptz, dropped boolean)
   where s.id = x."stopId" and s.trip_id = a.trip_id and s.status = 'planned'
     and not coalesce(x.dropped, false) and x.start is not null;
  update stops s set status = 'dropped'
    from jsonb_to_recordset(a.plan->'items') x("stopId" uuid, dropped boolean)
   where s.id = x."stopId" and s.trip_id = a.trip_id and s.status = 'planned'
     and coalesce(x.dropped, false) and not coalesce(s.is_booked, false);
  return true;
end $$;

-- Demo mode Reset: forget running-late cards checked after p_after, putting back the
-- stop times (and dropped stops) of any that were accepted. Latest first, so a stop
-- changed twice ends up with its first times.
create or replace function undo_late_alerts(p_trip uuid, p_after timestamptz)
returns int language plpgsql security invoker set search_path = public as $$
declare
  a record;
  n int;
begin
  if not is_member(p_trip) then raise exception 'Not a member of this trip'; end if;
  for a in
    select original from late_alerts
     where trip_id = p_trip and checked_at > p_after and status = 'accepted' and original is not null
     order by checked_at desc
  loop
    update stops s set
      planned_time = (o->>'planned_time')::timestamptz,
      planned_end = (o->>'planned_end')::timestamptz,
      status = case when s.status = 'dropped' then coalesce(o->>'status', 'planned') else s.status end
      from jsonb_array_elements(a.original) o
     where s.id = (o->>'id')::uuid and s.trip_id = p_trip;
  end loop;
  delete from late_alerts where trip_id = p_trip and checked_at > p_after;
  get diagnostics n = row_count;
  return n;
end $$;

-- Running early (migration 007).
-- One running-early card per stop the group is heading to, shared by the group: the first
-- phone that finds 30+ min to spare when the group leaves a stop saves it with the nearby
-- suggestion; everyone sees it through Realtime. Add this / Move earlier / Keep closes it.
create table if not exists early_alerts (
  stop_id uuid primary key references stops(id) on delete cascade, -- the stop they're heading to
  trip_id uuid not null references trips(id) on delete cascade,
  day_number int not null,
  left_stop_id uuid references stops(id) on delete set null,       -- the stop they just left
  left_at timestamptz,
  checked_at timestamptz not null, -- now() of the check (the fake time in Demo mode)
  spare_min int not null,          -- next stop's start - now - travel
  travel_min int not null,         -- free straight-line estimate (25 km/h)
  suggestion jsonb,                -- the nearby place; null = "Enjoy the extra time"
  limited boolean not null default false, -- no suggestion because a free daily limit was reached (migration 017)
  status text not null default 'open', -- open | offer (asked to move the next stop) | added | moved | kept
  added_stop_id uuid references stops(id) on delete set null,
  original jsonb,                  -- times of the stops changed, before (Demo mode Reset puts them back)
  changed jsonb,                   -- their new times (Demo mode's replay follows them)
  decided_by uuid references members(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists early_alerts_trip_idx on early_alerts (trip_id);
alter table early_alerts enable row level security;
drop policy if exists "early alerts all" on early_alerts;
create policy "early alerts all" on early_alerts for all using (is_member(trip_id)) with check (is_member(trip_id));

-- Answer the running-early card, once for the group:
--   'offer' = Go to next stop, and ask whether to move the next stop earlier (card stays open)
--   'add'   = Add this: insert p_add as a stop (and move the stops in p_times, if any)
--   'move'  = move the next stop earlier (p_times)
--   'keep'  = keep the original times
-- Booked stops (hotel, flights) never move. Returns false if someone already decided.
create or replace function decide_early(p_stop uuid, p_choice text, p_add jsonb default null, p_times jsonb default null)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  a early_alerts%rowtype;
  v_me uuid;
  v_new uuid;
  v_times jsonb := coalesce(p_times, '[]'::jsonb);
begin
  select * into a from early_alerts where stop_id = p_stop for update;
  if not found then raise exception 'No running-early card for this stop'; end if;
  if not is_member(a.trip_id) then raise exception 'Not a member of this trip'; end if;
  if a.status not in ('open', 'offer') then return false; end if;

  if p_choice = 'offer' then
    if a.status <> 'open' then return false; end if;
    update early_alerts set status = 'offer' where stop_id = p_stop;
    return true;
  end if;
  select id into v_me from members where trip_id = a.trip_id and user_id = auth.uid();
  if p_choice = 'keep' then
    update early_alerts set status = 'kept', decided_by = v_me, decided_at = now() where stop_id = p_stop;
    return true;
  end if;
  if p_choice not in ('add', 'move') then raise exception 'Choose offer, add, move or keep'; end if;
  if p_choice = 'add' and (a.status <> 'open' or p_add is null) then return false; end if;

  update early_alerts set original = (
    select jsonb_agg(jsonb_build_object('id', s.id, 'planned_time', s.planned_time, 'planned_end', s.planned_end))
      from stops s join jsonb_to_recordset(v_times) x(id uuid) on s.id = x.id
     where s.trip_id = a.trip_id and s.status = 'planned'
       and not coalesce(s.is_booked, false) and coalesce(s.category, '') not in ('flight', 'hotel'))
  where stop_id = p_stop;

  update stops s set planned_time = x.planned_time, planned_end = x.planned_end
    from jsonb_to_recordset(v_times) x(id uuid, planned_time timestamptz, planned_end timestamptz)
   where s.id = x.id and s.trip_id = a.trip_id and s.status = 'planned' and x.planned_time is not null
     and not coalesce(s.is_booked, false) and coalesce(s.category, '') not in ('flight', 'hotel');

  if p_choice = 'add' then
    insert into stops (trip_id, day_number, position, name, address, lat, lng, planned_time, planned_end,
                       price, is_estimate, is_booked, is_outdoor, category, place_id, tip)
    values (a.trip_id, (p_add->>'day_number')::int, (p_add->>'position')::int, p_add->>'name', p_add->>'address',
            (p_add->>'lat')::float8, (p_add->>'lng')::float8, (p_add->>'planned_time')::timestamptz,
            (p_add->>'planned_end')::timestamptz, coalesce((p_add->>'price')::numeric, 0), true, false,
            coalesce((p_add->>'is_outdoor')::boolean, false), p_add->>'category', p_add->>'place_id', p_add->>'tip')
    returning id into v_new;
  end if;

  update early_alerts set
    status = case p_choice when 'add' then 'added' else 'moved' end,
    added_stop_id = v_new, decided_by = v_me, decided_at = now(),
    changed = (
      select jsonb_agg(jsonb_build_object('id', s.id, 'planned_time', s.planned_time, 'planned_end', s.planned_end))
        from stops s where s.id in (select (o->>'id')::uuid from jsonb_array_elements(coalesce(original, '[]'::jsonb)) o))
  where stop_id = p_stop;
  return true;
end $$;

-- Demo mode Reset: forget running-early cards checked after p_after, putting back the stop
-- times they changed and removing the stops they added. Latest first.
create or replace function undo_early_alerts(p_trip uuid, p_after timestamptz)
returns int language plpgsql security invoker set search_path = public as $$
declare
  a record;
  n int;
begin
  if not is_member(p_trip) then raise exception 'Not a member of this trip'; end if;
  for a in
    select original, added_stop_id from early_alerts
     where trip_id = p_trip and checked_at > p_after and status in ('added', 'moved')
     order by checked_at desc
  loop
    update stops s set
      planned_time = (o->>'planned_time')::timestamptz,
      planned_end = (o->>'planned_end')::timestamptz
      from jsonb_array_elements(coalesce(a.original, '[]'::jsonb)) o
     where s.id = (o->>'id')::uuid and s.trip_id = p_trip;
    if a.added_stop_id is not null then
      delete from stops where id = a.added_stop_id and trip_id = p_trip;
    end if;
  end loop;
  delete from early_alerts where trip_id = p_trip and checked_at > p_after;
  get diagnostics n = row_count;
  return n;
end $$;

-- Rain backup (migration 010).
-- One rain card per outdoor stop, shared by the group: the first phone that finds rain
-- coming within the hour saves it with up to 3 indoor options; everyone sees it through
-- Realtime. Go (swap a place in) / Keep plan closes it for everyone.
create table if not exists rain_alerts (
  stop_id uuid primary key references stops(id) on delete cascade, -- the outdoor stop
  trip_id uuid not null references trips(id) on delete cascade,
  day_number int not null,
  checked_at timestamptz not null, -- now() of the check (the fake time in Demo mode)
  rain_in_min int not null,        -- minutes from checked_at until the rain
  options jsonb not null default '[]'::jsonb, -- up to 3 indoor places; [] = "consider moving it"
  limited boolean not null default false, -- no options because a free daily limit was reached (migration 017)
  status text not null default 'open', -- open | swapped | kept
  picked jsonb,                    -- the option swapped in
  added_stop_id uuid references stops(id) on delete set null, -- at the stop already: the new stop
  original jsonb,                  -- the outdoor stop before the swap (Demo mode Reset puts it back)
  decided_by uuid references members(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists rain_alerts_trip_idx on rain_alerts (trip_id);
alter table rain_alerts enable row level security;
drop policy if exists "rain alerts all" on rain_alerts;
create policy "rain alerts all" on rain_alerts for all using (is_member(trip_id)) with check (is_member(trip_id));

-- Answer the rain card, once for the group:
--   'go'   = swap the option with place id p_place in for the outdoor stop, keeping its time slot.
--            Still to come: the stop becomes that place. Already there: the stop ends at p_now
--            and the place is added from p_start to p_end (the rest of the slot).
--   'keep' = keep the plan.
-- Returns false if someone already decided (or the stop can't change any more).
create or replace function decide_rain(p_stop uuid, p_choice text, p_place text default null,
  p_now timestamptz default null, p_start timestamptz default null, p_end timestamptz default null)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  a rain_alerts%rowtype;
  s stops%rowtype;
  o jsonb;
  v_me uuid;
  v_new uuid;
  v_now timestamptz := coalesce(p_now, now());
begin
  select * into a from rain_alerts where stop_id = p_stop for update;
  if not found then raise exception 'No rain card for this stop'; end if;
  if not is_member(a.trip_id) then raise exception 'Not a member of this trip'; end if;
  if a.status <> 'open' then return false; end if;
  select id into v_me from members where trip_id = a.trip_id and user_id = auth.uid();

  if p_choice = 'keep' then
    update rain_alerts set status = 'kept', decided_by = v_me, decided_at = now() where stop_id = p_stop;
    return true;
  end if;
  if p_choice <> 'go' then raise exception 'Choose go or keep'; end if;

  select x into o from jsonb_array_elements(a.options) x where x->>'placeId' = p_place limit 1;
  if o is null then raise exception 'That place is not on the rain card'; end if;
  select * into s from stops where id = p_stop and trip_id = a.trip_id for update;
  if not found or s.status not in ('planned', 'arrived') or coalesce(s.is_booked, false) then return false; end if;

  update rain_alerts set original = jsonb_build_object(
      'name', s.name, 'address', s.address, 'lat', s.lat, 'lng', s.lng, 'place_id', s.place_id,
      'price', s.price, 'is_estimate', s.is_estimate, 'is_outdoor', s.is_outdoor, 'category', s.category,
      'tip', s.tip, 'note', s.note, 'halal_available', s.halal_available,
      'status', s.status, 'left_at', s.left_at, 'planned_end', s.planned_end)
  where stop_id = p_stop;

  if s.status = 'planned' then
    update stops set
      name = o->>'name', address = null, lat = (o->>'lat')::float8, lng = (o->>'lng')::float8,
      place_id = o->>'placeId', price = coalesce((o->>'price')::numeric, 0), is_estimate = true,
      is_outdoor = false, category = o->>'category', tip = null, note = null, halal_available = null
    where id = p_stop;
  else
    update stops set status = 'done', left_at = v_now, planned_end = v_now where id = p_stop;
    insert into stops (trip_id, day_number, position, name, lat, lng, planned_time, planned_end,
                       price, is_estimate, is_booked, is_outdoor, category, place_id, priority)
    values (a.trip_id, s.day_number, s.position, o->>'name', (o->>'lat')::float8, (o->>'lng')::float8,
            coalesce(p_start, v_now), coalesce(p_end, s.planned_end), coalesce((o->>'price')::numeric, 0),
            true, false, false, o->>'category', o->>'placeId', s.priority)
    returning id into v_new;
  end if;

  update rain_alerts set status = 'swapped', picked = o, added_stop_id = v_new, decided_by = v_me, decided_at = now()
  where stop_id = p_stop;
  return true;
end $$;

-- Demo mode Reset: forget rain cards checked after p_after, putting the swapped stops back
-- and removing the stops they added. Latest first.
create or replace function undo_rain_alerts(p_trip uuid, p_after timestamptz)
returns int language plpgsql security invoker set search_path = public as $$
declare
  a record;
  n int;
begin
  if not is_member(p_trip) then raise exception 'Not a member of this trip'; end if;
  for a in
    select stop_id, original, added_stop_id from rain_alerts
     where trip_id = p_trip and checked_at > p_after and status = 'swapped' and original is not null
     order by checked_at desc
  loop
    update stops s set
      name = a.original->>'name', address = a.original->>'address',
      lat = (a.original->>'lat')::float8, lng = (a.original->>'lng')::float8,
      place_id = a.original->>'place_id', price = coalesce((a.original->>'price')::numeric, 0),
      is_estimate = coalesce((a.original->>'is_estimate')::boolean, true),
      is_outdoor = coalesce((a.original->>'is_outdoor')::boolean, false),
      category = a.original->>'category', tip = a.original->>'tip', note = a.original->>'note',
      halal_available = (a.original->>'halal_available')::boolean,
      planned_end = (a.original->>'planned_end')::timestamptz,
      -- Ended by the swap: back to being there (Reset's own visit undo may already have moved it on).
      status = case when a.original->>'status' = 'arrived' and s.status = 'done' then 'arrived' else s.status end,
      left_at = case when a.original->>'status' = 'arrived' and s.status = 'done' then null else s.left_at end
     where s.id = a.stop_id and s.trip_id = p_trip;
    if a.added_stop_id is not null then
      delete from stops where id = a.added_stop_id and trip_id = p_trip;
    end if;
  end loop;
  delete from rain_alerts where trip_id = p_trip and checked_at > p_after;
  get diagnostics n = row_count;
  return n;
end $$;

-- Shared Demo mode (migration 018).
-- The trip's demo: on/off, the shared fake clock, the day and the last event reached.
-- Members can read it; it only changes through the demo_* functions below, which check
-- membership and `step` (a tap only applies if it saw the latest step, so two taps at
-- the same moment make one step).
create table demo_sessions (
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
create policy "demo read" on demo_sessions for select using (is_member(trip_id));

-- Demo mode: each real member's own phone battery (their position is pretend, their
-- battery is real). Never positions: Demo mode doesn't write to `locations`.
create table demo_batteries (
  member_id uuid primary key references members(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  battery int not null check (battery between 0 and 100),
  updated_at timestamptz not null default now()
);
create index demo_batteries_trip_idx on demo_batteries (trip_id);
alter table demo_batteries enable row level security;
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
create policy "pin photos delete orphan" on storage.objects for delete to authenticated
  using (bucket_id = 'pin-photos' and public.is_member(((storage.foldername(name))[1])::uuid)
    and not exists (select 1 from public.pins p where p.photo_url = objects.name));

-- Realtime
alter publication supabase_realtime add table
  locations, stops, pins, meet_points, spends, members, votes, trips, preferences, trip_options, late_alerts, early_alerts,
  rain_alerts, day_closures, demo_sessions, demo_batteries;
