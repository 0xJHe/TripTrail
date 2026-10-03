-- 001 planning: create trip, join, preferences, trip options, swipe vote.
-- Paste into Supabase > SQL Editor > Run (once). Safe to re-run.

-- Trip length is a range ("2 – 3 days"): length_min .. length_days.
alter table trips add column if not exists length_min int;

-- Where the group is in planning: preferences -> voting -> decided.
alter table trips add column if not exists stage text not null default 'preferences';

-- The creator must be able to read the trip they just inserted (before the
-- members row exists), otherwise insert(...).select() fails under RLS.
drop policy if exists "trips read own" on trips;
create policy "trips read own" on trips for select using (created_by = auth.uid());

-- Keep trip options in the order they were generated.
alter table trip_options add column if not exists position int not null default 0;

-- Realtime subscriptions are filtered by trip_id, so these tables need it too.
alter table preferences add column if not exists trip_id uuid references trips(id) on delete cascade;
alter table votes add column if not exists trip_id uuid references trips(id) on delete cascade;
create index if not exists preferences_trip_idx on preferences (trip_id);
create index if not exists votes_trip_idx on votes (trip_id);

-- Join codes are typed by hand: match them case-insensitively.
create or replace function join_trip(code text, name text, color text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select id into t from trips where join_code = lower(trim(code));
  if t is null then raise exception 'Invalid join code'; end if;
  insert into members (trip_id, user_id, display_name, avatar_color)
  values (t, auth.uid(), name, nullif(color, ''))
  on conflict (trip_id, user_id) do update set display_name = excluded.display_name;
  return t;
end $$;

-- Live "2 of 4 have answered", new options and stage changes.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'trips') then
    alter publication supabase_realtime add table trips;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'preferences') then
    alter publication supabase_realtime add table preferences;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'trip_options') then
    alter publication supabase_realtime add table trip_options;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'votes') then
    alter publication supabase_realtime add table votes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'members') then
    alter publication supabase_realtime add table members;
  end if;
end $$;
