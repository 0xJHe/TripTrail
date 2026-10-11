-- 015 Group tab: leave a trip, organiser hand-over, the last member deletes the trip.
-- Paste into Supabase > SQL Editor > Run (once, after 014). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

-- Set whenever someone leaves (an UPDATE on trips, which Realtime sends to everyone filtered by
-- id; a DELETE on members can't be filtered by trip_id, so it wouldn't reach the others).
alter table trips add column if not exists members_changed_at timestamptz;

-- A meet point set by someone who later leaves keeps working (it blocked deleting the member).
alter table meet_points drop constraint if exists meet_points_set_by_fkey;
alter table meet_points add constraint meet_points_set_by_fkey
  foreign key (set_by) references members(id) on delete set null;

-- True when I'm the trip's only member (about to delete it by leaving).
create or replace function is_only_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where trip_id = t and user_id = auth.uid())
     and (select count(*) from members where trip_id = t) = 1;
$$;

-- Pin photos: the last member may delete every photo in the trip's folder before leaving
-- (the app removes them with the Storage API; storage.objects can't be deleted from SQL).
drop policy if exists "pin photos delete last member" on storage.objects;
create policy "pin photos delete last member" on storage.objects for delete to authenticated
  using (bucket_id = 'pin-photos' and public.is_only_member(((storage.foldername(name))[1])::uuid));

-- Leave a trip: removes my member row (my preferences, votes, spends, pins, positions and
-- closures go with it). The organiser role passes to the member who joined earliest. The last
-- member deletes the trip and everything in it. Returns 'left' or 'deleted'.
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

  if not exists (select 1 from members where trip_id = p_trip) then
    -- Picks the nearby-suggestion function saved per stop (the rest of google_cache isn't per trip).
    delete from google_cache
     where key in (select 'nearby-pick:' || s.id from stops s where s.trip_id = p_trip
                   union all
                   select 'rain-pick:' || s.id from stops s where s.trip_id = p_trip);
    delete from trips where id = p_trip; -- cascades to every table with a trip_id
    return 'deleted';
  end if;

  if not exists (select 1 from members where trip_id = p_trip and user_id = t.created_by) then
    select user_id into next_user from members where trip_id = p_trip order by joined_at asc, id asc limit 1;
  end if;
  update trips
     set created_by = coalesce(next_user, created_by), members_changed_at = now()
   where id = p_trip;
  return 'left';
end $$;
revoke execute on function leave_trip(uuid) from public, anon;
grant execute on function leave_trip(uuid) to authenticated;
