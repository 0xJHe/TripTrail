-- 020 Clear the first-timer tip when a stop becomes a different place. The AI writes a tip for
-- the place it picked; Edit stop never sends `tip`, so changing the place (e.g. a dessert café
-- to a clinic) kept the old place's tip. Now a change of name or Google place clears it, unless
-- the same update sets a tip itself (Demo Reset's undo_rain_alerts puts the original tip back
-- together with the original place, so that one is kept).
-- Paste into Supabase > SQL Editor > Run (once, after 019). Safe to re-run.

create or replace function clear_tip_on_place_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.name is distinct from old.name or new.place_id is distinct from old.place_id)
     and new.tip is not distinct from old.tip then
    new.tip := null;
  end if;
  return new;
end $$;

drop trigger if exists stops_clear_tip on stops;
create trigger stops_clear_tip before update on stops for each row execute function clear_tip_on_place_change();
