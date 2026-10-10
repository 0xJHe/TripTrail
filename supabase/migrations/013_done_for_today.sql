-- 013 Done for today.
-- Paste into Supabase > SQL Editor > Run (once, after 012). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

-- One row per person per trip day once they tap "Done for today" (location off for the night).
-- Reopening the day ("tapped by mistake") sets closed = false: an UPDATE, which Realtime sends
-- to everyone filtered by trip_id (a DELETE can't be filtered, so it wouldn't reach the others).
-- closed_at is the phone's now() (the fake time in Demo mode, so Reset reopens the day).
alter table day_closures add column if not exists closed boolean not null default true;
delete from day_closures where trip_id is null;
alter table day_closures alter column trip_id set not null;
create index if not exists day_closures_trip_idx on day_closures (trip_id);

-- Everyone in the trip sees who has closed their day; each person closes / reopens only their own.
drop policy if exists "closures all" on day_closures;
drop policy if exists "closures read" on day_closures;
drop policy if exists "closures insert own" on day_closures;
drop policy if exists "closures update own" on day_closures;
create policy "closures read" on day_closures for select using (is_member(trip_id));
create policy "closures insert own" on day_closures for insert with check (
  exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = day_closures.trip_id));
create policy "closures update own" on day_closures for update
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid()))
  with check (
    exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = day_closures.trip_id));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'day_closures') then
    alter publication supabase_realtime add table day_closures;
  end if;
end $$;
