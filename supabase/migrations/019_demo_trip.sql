-- 019 Try a demo trip (Settings > Try a demo trip).
-- Paste into Supabase > SQL Editor > Run (once, after 018). Safe to re-run.
-- Then run supabase/seed_demo_trip.sql to save (or refresh) the Penang demo template.
-- Only for databases made before this change: schema.sql already includes all of it.

-- A copy made by start_demo_trip points at its template (null = a normal trip). Copies are
-- private: nobody can join them by code.
alter table trips add column if not exists demo_of uuid references trips(id) on delete set null;
-- A made-up member (marked "(demo)" in the name): no account (user_id null), never a real person.
-- The app leaves them out of every "real member" count (Done for today, spend checks, map, organiser).
alter table members add column if not exists is_demo boolean not null default false;

-- The hidden demo templates: trips with no real members (so nobody can read them through RLS),
-- copied by start_demo_trip. Only the SQL editor (or service role) can add one: RLS on, no policies.
create table if not exists demo_templates (
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
drop trigger if exists trips_lock_demo on trips;
create trigger trips_lock_demo before insert or update on trips for each row execute function lock_demo_fields();
drop trigger if exists members_lock_demo on members;
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
