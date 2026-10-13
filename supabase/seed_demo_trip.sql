-- The Penang demo template that Settings > Try a demo trip copies (start_demo_trip, migration 019).
-- Paste into Supabase > SQL Editor > Run, after 019. Safe to re-run: it refreshes the template
-- in place (copies people already made keep their own plan).
--
-- Written by hand, no Gemini. Every stop's name, address, location and place ID come from
-- Google Places (place-search: autocomplete + details, 13 Oct 2026). The two halal-certified
-- restaurants were checked on JAKIM's Malaysia Halal Portal (halal.gov.my, Premis Makanan) on
-- 13 Oct 2026:
--   Nasi Kandar Pelita - Macalister (NASI KANDAR PELITA SDN BHD), 146-A Jalan Macalister,
--     10400 George Town; ref JAKIM.700-2/3/2 084-03/2012; premise listing expires 15/04/2028.
--   Garden Cafe Restaurant (GOLDEN SANDS RESORT PENANG, MALAYSIA BY SHANGRI-LA), Batu Feringgi
--     Beach, 11100; ref JAKIM.700-2/3/2 094-11/2025; premise listing expires 15/03/2028.
--
-- The template is hidden: it has no real members, so RLS shows it to nobody, and its join code
-- can't be used (join_trip refuses demo templates). Times are Malaysia time (+08); the copy
-- moves them so Day 1 is the day after the person taps the button.
-- Demo mode moments this plan gives (features/demo/route.ts, checked in __tests__/demo/demoTrip.test.ts):
--   Day 1: late for lunch at Nasi Kandar Pelita, early out of Khoo Kongsi, rain over Gurney Drive,
--          a member far away during Fort Cornwallis, then "That's every stop for today".
--   Day 2: late at Kek Lok Si, early out of the laksa stall, rain over Batu Ferringhi Beach,
--          a member far away during Kek Lok Si, then the end of the day.

do $seed$
declare
  tpl constant uuid := 'd3e0d3e0-0000-4000-8000-000000000001';
  aisha constant uuid := 'd3e0d3e0-0000-4000-8000-0000000000a1';
begin
  insert into trips (id, name, destination, month, length_min, length_days, dates_fixed, start_date, end_date,
                     join_code, created_by, stage)
  values (tpl, 'Penang demo trip', 'Penang', '2026-11', 2, 2, true, '2026-11-02', '2026-11-03',
          'demo-template-penang', null, 'decided')
  on conflict (id) do update set
    name = excluded.name, destination = excluded.destination, month = excluded.month,
    length_min = excluded.length_min, length_days = excluded.length_days, dates_fixed = true,
    start_date = excluded.start_date, end_date = excluded.end_date, stage = 'decided';
  insert into demo_templates (trip_id) values (tpl) on conflict (trip_id) do nothing;

  -- The made-up member: needs halal food, so food stops show the halal tag and JAKIM link.
  delete from members where trip_id = tpl;
  insert into members (id, trip_id, user_id, display_name, avatar_color, is_demo)
  values (aisha, tpl, null, 'Aisha (demo)', null, true);
  insert into preferences (member_id, trip_id, daily_budget, free_dates, food_needs, must_haves, no_go)
  values (aisha, tpl, 200, array['2026-11-02', '2026-11-03']::date[], array['Halal'],
          array['Famous sights', 'Street food', 'Beach'], 'Long hikes');

  delete from stops where trip_id = tpl;
  insert into stops (trip_id, day_number, position, name, address, lat, lng, planned_time, planned_end,
                     price, is_estimate, is_booked, is_outdoor, tip, category, priority, halal_available, place_id)
  select tpl, s.day_number, s.position, s.name, s.address, s.lat, s.lng, s.planned_time, s.planned_end,
         s.price, true, false, s.is_outdoor, s.tip, s.category, s.priority, s.halal_available, s.place_id
    from jsonb_populate_recordset(null::stops, $stops$[
  {"day_number": 1, "position": 0, "name": "Fort Cornwallis",
   "address": "4, Jalan Tun Syed Sheh Barakbah, George Town, 10200 George Town, Pulau Pinang, Malaysia",
   "lat": 5.4204143, "lng": 100.3445489, "place_id": "ChIJSYg_noXDSjAR3mSegGnJxdQ",
   "planned_time": "2026-11-02T09:00:00+08:00", "planned_end": "2026-11-02T10:15:00+08:00",
   "price": 20, "category": "sight", "is_outdoor": true, "priority": 2,
   "tip": "Come early, before the midday heat. The big cannon, Seri Rambai, sits on the north wall."},
  {"day_number": 1, "position": 1, "name": "Pinang Peranakan Mansion",
   "address": "29, Church St, Georgetown, 10200 George Town, Penang, Malaysia",
   "lat": 5.4178275, "lng": 100.3412046, "place_id": "ChIJCWvz3I_DSjAR5hveCXjdfIs",
   "planned_time": "2026-11-02T10:45:00+08:00", "planned_end": "2026-11-02T12:15:00+08:00",
   "price": 25, "category": "sight", "is_outdoor": false, "priority": 2,
   "tip": "Join one of the guided tours: they run through the day and explain the Baba-Nyonya rooms."},
  {"day_number": 1, "position": 2, "name": "Nasi Kandar Pelita",
   "address": "146A, Jln Macalister, George Town, 10400 George Town, Pulau Pinang, Malaysia",
   "lat": 5.4161045, "lng": 100.324604, "place_id": "ChIJwfgyLbzDSjAR5g97tiRz17Q",
   "planned_time": "2026-11-02T12:45:00+08:00", "planned_end": "2026-11-02T13:45:00+08:00",
   "price": 18, "category": "food", "is_outdoor": false, "priority": 3, "halal_available": true,
   "tip": "Point at the curries you want and ask for \"kuah campur\" (mixed gravies) over your rice. You pay after eating."},
  {"day_number": 1, "position": 3, "name": "Leong San Tong Khoo Kongsi",
   "address": "18, Cannon Square, George Town, 10450 George Town, Pulau Pinang, Malaysia",
   "lat": 5.4145737, "lng": 100.33719, "place_id": "ChIJny-BJpLDSjARtmEDgFcyASw",
   "planned_time": "2026-11-02T14:15:00+08:00", "planned_end": "2026-11-02T16:00:00+08:00",
   "price": 15, "category": "sight", "is_outdoor": false, "priority": 2,
   "tip": "Cover your shoulders inside the clan temple. The small museum downstairs tells the Khoo family's story."},
  {"day_number": 1, "position": 4, "name": "Gurney Drive Hawker Center",
   "address": "172, Solok Gurney 1, Pulau Tikus, 10250 Jelutong, Pulau Pinang, Malaysia",
   "lat": 5.4402265, "lng": 100.3087316, "place_id": "ChIJA8mqOQbDSjAR-EXxQ-Vvf44",
   "planned_time": "2026-11-02T18:30:00+08:00", "planned_end": "2026-11-02T20:00:00+08:00",
   "price": 25, "category": "food", "is_outdoor": true, "priority": 3,
   "tip": "Grab a table first and note its number: the stalls bring your food to it. Bring small cash."},
  {"day_number": 2, "position": 0, "name": "Penang Hill Lower Station",
   "address": "Jalan Bukit Bendera, 11500 Ayer Itam, Pulau Pinang, Malaysia",
   "lat": 5.4082091, "lng": 100.2771278, "place_id": "ChIJA-PXgBTCSjARuY1ndOiYZSk",
   "planned_time": "2026-11-03T08:30:00+08:00", "planned_end": "2026-11-03T11:00:00+08:00",
   "price": 30, "category": "sight", "is_outdoor": true, "priority": 2,
   "tip": "Take the funicular up early, when the queue is shortest. It's cooler at the top: bring a light layer."},
  {"day_number": 2, "position": 1, "name": "Kek Lok Si Temple",
   "address": "Kek Lok Si Temple, 86s, Jln Balik Pulau, 11500 Ayer Itam, Pulau Pinang, Malaysia",
   "lat": 5.3996413, "lng": 100.2736126, "place_id": "ChIJZYb8XRjCSjARxD5Df-qEkCw",
   "planned_time": "2026-11-03T11:30:00+08:00", "planned_end": "2026-11-03T13:00:00+08:00",
   "price": 10, "category": "sight", "is_outdoor": true, "priority": 2,
   "tip": "Wear comfy shoes, there are a lot of steps. The inclinator up to the Kuan Yin statue costs a little extra."},
  {"day_number": 2, "position": 2, "name": "Penang Air Itam Laksa",
   "address": "Jalan Pasar, Paya Terubong, 11500 George Town, Pulau Pinang, Malaysia",
   "lat": 5.4014701, "lng": 100.2781281, "place_id": "ChIJwdpLbxfCSjARO2Ok2SJHOIk",
   "planned_time": "2026-11-03T13:15:00+08:00", "planned_end": "2026-11-03T14:00:00+08:00",
   "price": 10, "category": "food", "is_outdoor": false, "priority": 2,
   "tip": "The famous stall by Air Itam market: sour, spicy assam laksa. Bring small cash and expect a short queue."},
  {"day_number": 2, "position": 3, "name": "Batu Ferringhi Beach",
   "address": "Jalan Batu Ferringhi Batu Ferringhi, 11100 George Town, Pulau Pinang, Malaysia",
   "lat": 5.4734004, "lng": 100.2460575, "place_id": "ChIJ7UncVgjoSjARkKYoZ2QZCCk",
   "planned_time": "2026-11-03T15:30:00+08:00", "planned_end": "2026-11-03T18:45:00+08:00",
   "price": 0, "category": "beach", "is_outdoor": true, "priority": 1,
   "tip": "Swim only near the lifeguards and watch for jellyfish. Stay on for the sunset."},
  {"day_number": 2, "position": 4, "name": "Garden Cafe • Golden Sands Resort • Penang",
   "address": "Lobby Level Batu, Feringgi Plaza, 152B, Jalan Batu Ferringhi, Shamrock Beach, 11100 George Town, Penang, Malaysia",
   "lat": 5.4764001, "lng": 100.2513216, "place_id": "ChIJdfBqWPznSjAREGSF13fNvbY",
   "planned_time": "2026-11-03T19:00:00+08:00", "planned_end": "2026-11-03T20:30:00+08:00",
   "price": 80, "category": "food", "is_outdoor": false, "priority": 3, "halal_available": true,
   "tip": "In the Shangri-La Golden Sands lobby, a short walk along the beach. Try the satay or the Garden Cafe nasi lemak."}
]$stops$::jsonb) s;
end $seed$;
