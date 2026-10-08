-- 007 Running early.
-- Paste into Supabase > SQL Editor > Run (once, after 006). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

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

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'early_alerts') then
    alter publication supabase_realtime add table early_alerts;
  end if;
end $$;
