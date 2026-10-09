-- 008 Spend check.
-- Paste into Supabase > SQL Editor > Run (once, after 007). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

-- One answer per person per stop to "About RM 16 spent?" after leaving a stop with an
-- estimated price: ✓ (confirmed = true, amount = the estimate), an amount typed in
-- (confirmed = false), or skipped (skipped = true, amount = the estimate, which stays).
alter table spends add column if not exists trip_id uuid references trips(id) on delete cascade;
update spends sp set trip_id = s.trip_id from stops s where s.id = sp.stop_id and sp.trip_id is null;
alter table spends add column if not exists skipped boolean not null default false;
-- now() on the phone when answered (the fake time in Demo mode, so Reset can hide later answers).
alter table spends add column if not exists answered_at timestamptz not null default now();

-- Keep each person's first answer per stop, then allow only one.
delete from spends a using spends b
 where a.stop_id = b.stop_id and a.member_id = b.member_id and a.created_at > b.created_at;
create unique index if not exists spends_stop_member_key on spends (stop_id, member_id);
create index if not exists spends_trip_idx on spends (trip_id);

-- Everyone in the trip can see the answers ("Spent so far"); each person writes only their own.
drop policy if exists "spends all" on spends;
drop policy if exists "spends read" on spends;
drop policy if exists "spends insert own" on spends;
drop policy if exists "spends update own" on spends;
drop policy if exists "spends delete own" on spends;
create policy "spends read" on spends for select using (is_member(trip_id));
create policy "spends insert own" on spends for insert with check (
  exists (select 1 from members m join stops s on s.trip_id = m.trip_id
           where m.id = member_id and m.user_id = auth.uid() and s.id = stop_id and s.trip_id = spends.trip_id));
create policy "spends update own" on spends for update
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid()))
  with check (
    exists (select 1 from members m join stops s on s.trip_id = m.trip_id
             where m.id = member_id and m.user_id = auth.uid() and s.id = stop_id and s.trip_id = spends.trip_id));
create policy "spends delete own" on spends for delete
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid()));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'spends') then
    alter publication supabase_realtime add table spends;
  end if;
end $$;
