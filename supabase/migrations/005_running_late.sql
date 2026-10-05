-- 005 Running late.
-- Paste into Supabase > SQL Editor > Run (once). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

-- Paid API calls per trip per day (Malaysia time), by kind: 'routes' (max 20, eta
-- function) and 'ai_replan' (max 5, replan-day function). Separate from the Places and
-- weather counters. Only the Edge Functions use it (service role): RLS on, no policies.
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
-- group will be late saves it with the simple-rules new day; everyone sees it through
-- Realtime. "Ask AI" adds ai_plan. Accept / Keep original closes it for everyone.
create table if not exists late_alerts (
  stop_id uuid primary key references stops(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  day_number int not null,
  checked_at timestamptz not null, -- now() of the check (the fake time in Demo mode)
  travel_min int not null,
  travel_source text not null,     -- estimate | google
  starts_at timestamptz,           -- the stop's planned start when checked
  plan jsonb not null,             -- simple-rules new day
  ai_plan jsonb,                   -- Gemini's new day, once someone asked
  status text not null default 'open', -- open | accepted | kept
  chosen text,                     -- rules | ai (when accepted)
  original jsonb,                  -- the stops' times before accepting (Demo mode Reset puts them back)
  decided_by uuid references members(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists late_alerts_trip_idx on late_alerts (trip_id);
alter table late_alerts enable row level security;
drop policy if exists "late alerts all" on late_alerts;
create policy "late alerts all" on late_alerts for all using (is_member(trip_id)) with check (is_member(trip_id));

-- Accept a new day ('rules' or 'ai') or keep the original ('keep'), once for the group.
-- Accepting moves the stops' times and drops stops in one go; everyone's Today and Plan
-- change live through Realtime. Returns false if someone already decided.
create or replace function decide_new_day(p_stop uuid, p_choice text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  a late_alerts%rowtype;
  v_plan jsonb;
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
  v_plan := case p_choice when 'ai' then a.ai_plan when 'rules' then a.plan end;
  if v_plan is null then raise exception 'That plan is not there'; end if;

  update late_alerts set
    status = 'accepted', chosen = p_choice, decided_by = v_me, decided_at = now(),
    original = (
      select jsonb_agg(jsonb_build_object('id', s.id, 'planned_time', s.planned_time,
                                          'planned_end', s.planned_end, 'status', s.status))
      from stops s join jsonb_to_recordset(v_plan->'items') x("stopId" uuid) on s.id = x."stopId"
      where s.trip_id = a.trip_id)
  where stop_id = p_stop;

  update stops s set planned_time = x.start, planned_end = x."end"
    from jsonb_to_recordset(v_plan->'items') x("stopId" uuid, start timestamptz, "end" timestamptz, dropped boolean)
   where s.id = x."stopId" and s.trip_id = a.trip_id and s.status = 'planned'
     and not coalesce(x.dropped, false) and x.start is not null;
  update stops s set status = 'dropped'
    from jsonb_to_recordset(v_plan->'items') x("stopId" uuid, dropped boolean)
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

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'late_alerts') then
    alter publication supabase_realtime add table late_alerts;
  end if;
end $$;
