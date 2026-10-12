# TripTrail — project brain file

Read this fully before doing anything. Follow it on every task.

## What we are building

TripTrail is a group trip planner (Android, Expo/React Native) that uses the group's
live location to keep the itinerary accurate during the trip. Everyone sets their
budget, free dates and preferences, votes by swiping on AI-generated trip options,
and the app builds a day-by-day itinerary with a time, price and location on every
stop. During the trip it compares where the group actually is against the plan and,
when they are running late, early, separated, or about to get rained on, proposes a
fixed version of the day. Works solo too (no voting, no group map).

Full product spec: README.md (sections 1, 3, 5). Visual design: design/prototype.html
(15 screens, numbered). When a task says "match screen N", open that file.

## Feature list (all of this gets built)

Planning:
1. Create trip + invite by link/join code (screen 1)
2. Preferences: daily budget, free dates on a calendar, food needs, 3 must-haves,
   1 no-go, "2 of 4 have answered" (screen 2)
3. Date finder: days all members are free
4. AI trip options from everyone's answers (screen 3)
5. Swipe to vote; most likes wins (screens 3, 4)
6. AI day-by-day itinerary with time + price per stop; flights/hotel entered
   manually as booked stops (screen 5)
7. Edit any stop, add a stop (screen 5)
8. Budget bar: spent / planned / budget, "+ Add spend" (amount + optional note)
   and that day's extra spends under it (screen 5)

During the trip:
9. Auto-arrive: stop ticks itself off within ~100 m; real journey time shifts
   later stops (screen 6)
10. Running late: Now / Travel / Starts tiles, suggested new day (simple rules,
    no AI), cost change, Accept new day / Keep original (screen 7)
11. Running early: one nearby suggestion within budget, Add this / Go to next
    stop (screen 8)
12. Group map: positions + battery %, far-from-group alert, low-battery alert,
    auto-broadcast last known location under 15% (screen 11)
13. Set meet point with directions + per-person ETA; Split & rejoin, group B can add
    their own stops until the rejoin time (screens 11, 12)
14. Pin spot: Spot / Vehicle, name, optional photo, shows on group map, Add to
    plan / Directions (screen 13)
15. "We're done here" button (screens 6–9)
16. Rain backup: rain at current location in next hour -> 3 nearby indoor
    options within budget and food needs (screen 10)
17. Spend check on leaving any stop: "About RM 16 spent?" ✓ / Enter amount /
    Skip; bookings: "Spent anything extra at [stop]?" (screen 9)
18. First-timer tip on arrival (screen 6); Settings > First-timer tips on/off (on by default)
19. Done for today: planned vs actual, edit tomorrow, location off for the night,
    back on 1 h before tomorrow's first stop (screen 14)
20. Day recap story card: route walked, stop emojis, km / stops / hours /
    weather, Share + Download (screen 15)

## Tech stack (do not change)

- Expo SDK (latest), React Native, TypeScript, Expo Router (file-based routes).
- Supabase: anonymous auth with display name, Postgres, Realtime, Storage (pin photos).
- Supabase Edge Functions (folder `supabase/functions/`, Deno + TypeScript) for
  ALL external APIs: Gemini, Google Maps Places / Distance Matrix, Google
  Weather. The Gemini and Google keys live only in Supabase
  secrets (`npx supabase secrets set NAME=value`; GEMINI_API_KEY is set).
  App code never holds them. App only holds EXPO_PUBLIC_SUPABASE_URL and
  EXPO_PUBLIC_SUPABASE_ANON_KEY from .env (EXPO_PUBLIC_API_BASE_URL is no
  longer needed).
  The app calls them with `supabase.functions.invoke(name, { body })`, which
  sends the user's JWT. Each function checks the caller's Supabase JWT
  (Authorization: Bearer) and that they are a member of the trip before doing
  work. lib/ai.ts calls the Gemini ones; the functions fall back to sample data
  themselves (_shared/tripOptions.ts, _shared/itinerary.ts), and if one can't be
  reached lib/ai.ts makes the same samples, so the app never gets stuck.
  Deploy: `npx supabase functions deploy <name> --project-ref <ref> --no-verify-jwt`
  (the project uses the new sb_publishable keys, so the function checks the JWT
  itself). Logs: Supabase dashboard > Edge Functions > <name> > Logs.
- expo-location + expo-task-manager for background location (the task lives in
  lib/location.ts; it can't run in Expo Go, so it is skipped there).
- react-native-maps for maps, `provider={PROVIDER_GOOGLE}`. The Android Maps key is the EAS
  env var GOOGLE_MAPS_ANDROID_KEY (preview environment; restricted to com.triptrail.app +
  the EAS keystore SHA-1, Maps SDK for Android only). app.config.ts keeps app.json and
  adds it to the react-native-maps plugin. Never put the key in git. Expo Go needs no key.
- expo-battery for battery %.
- @react-native-community/datetimepicker (the Android clock picker for stop times) and
  expo-localization (the phone's 12 / 24-hour setting, so picked times show the phone's way;
  saved as "HH:MM"). Native: they need the development build / APK made after they were
  added; features/planning/phoneClock.ts loads them only when there, and an older build
  falls back to typing the time (features/planning/components/TimeField.tsx).
- react-native-view-shot (capture the day recap card), expo-sharing (share sheet) and
  expo-media-library (save to gallery, `expo-media-library/legacy`). Native: they need the
  development build / APK made after they were added; features/recap/shareImage.ts loads them
  only when tapped and says "needs the latest build" instead of crashing on an older one.
- Development build (expo-dev-client): `npx eas-cli build -p android --profile development`
  (APK, internal, preview env vars, same package + keystore as the preview APK). With
  expo-dev-client installed, `expo start` / `npm run start:tunnel` open the development
  build by default; add `--go` for Expo Go. Background location and our Maps key only
  work in the development build / APK.
- Zustand for client state. React Query (TanStack) for Supabase reads.
- Jest + @testing-library/react-native for tests.

## Folder rules

app/                  Expo Router routes only (thin; they import from features)
  (tabs)/plan.tsx  today.tsx  map.tsx  group.tsx
features/
  trip/               sign-in, create trip, join, invite link, members
  planning/           preferences, date finder, trip options, swipe, vote, itinerary, edit stop
  today/              today card, arrive/leave detection, late, early, done-here, rain, tips
  money/              budget bar, spend check
  group/              group map, meet point, split & rejoin, pins, Group tab (members, invite, leave)
  recap/              done for today, day recap card
lib/
  supabase.ts         client
  location.ts         location service (real + demo)
  clock.ts            now() — real or demo time
  distance.ts         haversine, ETA helpers, cached Distance Matrix calls
  theme.ts            colours, spacing, fonts
supabase/
  schema.sql          tables + RLS
supabase/functions/   Supabase Edge Functions (Deno), one folder each with index.ts:
  generate-trip-options  generate-itinerary  eta
  nearby-suggestion (running early + rain backup)  weather  place-search  refresh-photo
  _shared/            shared: gemini client, google client, auth check, zod schemas,
                      tripOptions.ts (types + sample options, also imported by lib/ai.ts;
                      files here must stay plain TS with no imports so React Native
                      and Deno can both use them)
design/prototype.html  the 15 screens
__tests__/            tests mirror feature folders

Each feature folder has: screens/, components/, hooks/, api.ts (Supabase calls),
types.ts. Keep screens under ~200 lines; split into components.

## Design tokens (lib/theme.ts)

- navy #14284F: headers, all "Now" blocks (white text on navy)
- teal #00A38F: every primary action button
- red #D64545 = problem (running late), green #2E9E5B = good news (running early,
  cost change 0), amber #E39B21 = worth knowing (far member, low battery),
  blue #3B7DD8 = weather (rain)
- Colour is never the only signal: every alert has an icon and a plain headline.
- Font Inter, sizes 12 / 14 / 17 / 24. Card radius 16. Primary button full width,
  pinned to the bottom, min height 48.
- Bottom tabs on every main screen: Plan · Today · Map · Group.
- Money: estimates shown with "~" (e.g. ~RM 16). Currency RM.
- Durations: durationText() in features/planning/stops.ts everywhere: "40 min", and
  hours + minutes from 60 on ("1 h 15 min"); long form for titles ("40 minutes").

## Demo mode (must always work)

Settings has a Demo mode toggle. When on:
- lib/location.ts replays a fake route built from the open trip's Day plan
  (features/demo/route.ts) instead of GPS.
- lib/clock.ts returns a settable fake time; a small debug bar lets you jump
  the clock and skip to the next event.
- The Edge Functions are still called. If Google Places fails or finds nothing for
  the running-early suggestion or the rain options, Demo mode (only) shows made-up
  nearby places (features/today/demoPlaces.ts), so those cards always have some.
Every feature must be testable in Demo mode from a room, not a real trip.

Time and location rule (built; follow it in every live-trip feature):
- Get the time ONLY from lib/clock.ts: `now()` or the `useNow()` hook. Never call
  `new Date()` / `Date.now()` for "what time is it" in Today, alerts, arrive/leave,
  late/early, rain, group map, recap, etc.
- Get positions ONLY from lib/location.ts: `getGroupLocation()` or the
  `useGroupLocation()` hook (members, battery, centre, `rainSoon` in demo). Never
  import expo-location anywhere else.
- Demo mode lives in lib/demo.ts (Settings > Demo mode, saved on the phone). The fake
  route is built from the open trip's Day plan by features/demo/route.ts: it walks
  stop to stop and includes arriving late, leaving early, rain near an outdoor stop,
  and one member 900 m away with low battery (from a stop until 10 min after the group
  reaches the next one, so it lasts several Next event taps: far, leave, on the way,
  arrive, then back; the Today tab shows an amber "Mei is 900 m from the group · Open
  map" banner meanwhile, features/group/components/FarBanner.tsx, the far-from-group
  rule, so real trips get it too). Every "Left [stop]" event sits where the leave is
  noticed (150 m out for 3 min), so its spend check (and an early card) show on that
  tap; after the last stop a final "That's every stop for today" event (kind 'end')
  comes before Next day. The rain card never lands on a leave tap: if it would, the
  rain comes later so it gets its own Next event. The "late" moment is the
  30-min-before check while the group is still at the stop before (screen 7). The
  "early" moment is a later stop left 30+ min before its planned end with 45+ min to
  spare before the next (screen 8);
  the "rain" moment is rain over an outdoor stop (after the early one) starting 10 min
  after the group gets there, so the rain card shows before they arrive;
  the moments are picked from the plan before any running-early change or rain swap,
  and the replay follows added / moved / swapped stops. Reset undoes rain cards, then
  early, then late ones, and removes this phone's pins and "+ Add spend" rows made
  during the demo (at or after the fake start time; features/demo/reset.ts,
  useDemoReset). The bar at the
  top (+15 min, Next event, Reset) is features/demo/components/DemoBar.tsx.
- Settings: the gear + "Settings" (SettingsButton) is in the header of every main
  screen: Home, Plan, Today, Map, Group. Settings also has First-timer tips (on by default,
  saved on the phone: features/today/tipsSetting.ts); off = no tip card on Today.

## Behaviour rules for you (the agent)

- Only edit the folder(s) named in the task plus tests. Ask before touching
  lib/, schema.sql, or this file.
- Before a task that touches more than 3 files, list the files you will
  create/change first.
- After changes: run `npx tsc --noEmit` and `npx jest`; fix errors before
  saying done. Do not leave TODOs for the core flow.
- Sample data first, real API second. Every screen must render (an empty state or
  sample data) when tables are empty.
- Gemini: ask for JSON only, validate with zod, retry once, then fall back to
  sample data. Never crash on a bad AI response. Always through the model chain
  (see "Gemini model chain" below), never one fixed model.
- Cache Distance Matrix results (same origin/destination within 10 min) to
  protect quota.
- Realtime subscriptions are filtered by trip_id and cleaned up on unmount.
- No API keys in app code or in git. .env is gitignored; .env.example lists names.
- Keep README.md and images/ untouched unless the task is "update README".
- Commit message style: short, present tense, e.g. "add preferences screen".

## Key logic (so every feature uses the same rules)

- Gemini model chain (supabase/functions/_shared/geminiChain.ts, used by generate-trip-options
  and generate-itinerary through edge.ts makeGeminiChain): free tier limits are tiny and per
  model (e.g. 5 a minute, 20 a day), so each request walks a list, best first:
  gemini-3.8-flash, 3.7-flash, 3.6-flash, 3.5-flash, 3.5-flash-lite, 3-flash-preview,
  3.1-flash-lite, 2.5-flash, 2.5-flash-lite, 2.0-flash, 2.0-flash-lite, gemma-4-31b-it,
  gemma-4-26b-a4b-it (DEFAULT_GEMINI_MODELS; the Supabase secret GEMINI_MODELS, comma-separated,
  overrides it without a deploy). Daily quota reached / "not found" / "not available" -> the
  model goes in the gemini_used_up table until the next midnight Pacific (Google's reset) and
  every request skips it that day; only rate limited for the minute (429 per-minute, 503
  overloaded) -> next model, never marked; other errors -> next model. An answer that fails our
  checks gets ONE retry, on the next model. Every model left busy -> wait 3 s, try those once
  more, then the function answers { busy: true } (no samples): the app (lib/ai.ts AiBusyError)
  shows "Our AI is busy right now" with Try again (AiBusyCard). Every model used up -> sample
  options / plan with a note. Gemma gets no JSON mode: "JSON only" goes in the prompt and the
  JSON is read from the text (jsonText). Which model answered: the function logs "answered by
  <model>" and returns `model`. Saved options and a built plan are never made again: the
  functions answer 409 once the trip has options / is 'decided', and the app never calls them then.

- Arrived: within 100 m of stop for 2 consecutive readings -> status "arrived",
  arrived_at = now. Left: more than 150 m away for 3 minutes after arrived ->
  left_at = now, status "done".
  Two stops within 150 m of each other: arriving at the next one only counts from
  15 min before its planned start (being near it early doesn't skip the current stop).
  Any stop that isn't the next one on the plan (the first still planned) also only counts
  from 15 min before its planned start, so walking past a later stop on the way to another
  one doesn't tick it off (George Town: Armenian Street -> Cheong Fatt Tze passes ~50 m
  from Chulia Street). The end-of-day check follows the clock: the last stop's leave and
  the "N of N visited" count only include visits up to now() (Demo mode: the fake time).
- Today's navy block between stops (features/today/todayPlan.ts justLeftStop, useToday):
  at a stop it is "Now" (We're done here + Pin spot). After leaving, "Just left [stop]"
  (Pin spot only) while anything about leaving is still to answer: the spend check, an open
  running-early card (its left stop), or an open running-late card (the stop left last up to
  now()); with a late card up, Next sits inside the late card as at a stop. Once all are
  answered or dismissed: "On the way to [next stop]" until the group arrives, with
  Directions + Pin spot side by side (equal width). Directions opens Google Maps (no API
  call): walking if the stop is under 2 km in a straight line from this phone (else the
  group centre, else the stop left last), otherwise driving; Maps picks if neither end is
  known (travelModeTo). Demo mode: the route has an "On the way to [next]" event (kind
  'travel') between every leave and the next arrival, 3+ min after the leave event (which
  is where the leave is noticed) and no earlier than halfway; none when the stops are too
  close for the leave to be noticed on the way.
- Running late (features/today/late.ts, supabase/functions/_shared/eta.ts + newDay.ts):
  check the next stop once ~30 min before it starts and once when the group leaves
  a stop if the next starts in < 30 min (max 2 checks, one card per stop, shared
  in late_alerts). Only before the stop's planned start: it is an early warning,
  never checked once the start time has passed. Travel = straight line at 25 km/h;
  only if that is within 10 min of the start or later, ask the eta function (Google
  Routes, one phone per stop, max 20 calls per trip per day).
  now + travel > planned_time + 5 min (paceFor = "late") -> late card.
  Suggested new day = simple rules, no AI: the late stop moves to the arrival time
  ("next slot", even a meal); later stops shift and those with spare time are
  shortened; only booked stops (hotel, flights) never move; if the day would still
  end > 30 min after the original plan's end, drop the lowest-priority stop.
  Accept / Keep original = decide_new_day RPC (once for the group).
- Spare time (ONE shared rule for running late and running early, in
  supabase/functions/_shared/eta.ts: spareMinutes / paceFor): spare = next stop's
  planned start − now() − travel. spare < −5 min -> "late"; spare >= 30 min ->
  "early"; else on time. One figure gives one answer, so both cards can never apply,
  and the late check only asks Google when spare <= 10 (never when it is "early").
- Running early (features/today/early.ts, useEarlyCheck, nearby-suggestion function):
  checked when the group leaves a stop or taps "We're done here". Two figures:
  ahead = that stop's planned_end − when they left (the number in the title,
  "You're N minutes ahead"), and spare (shared rule above, free estimate at
  25 km/h, no Google), which only sizes "Add this" and the suggestion. Card only if
  ahead >= 15 min AND spare >= 30 min AND not "late". No card if there is no next stop today, if the next stop
  has a late card (any status: late always wins, and an open late card hides an early
  one), or if it already had an early card (once per stop, shared in early_alerts).
  Suggestion: Places Nearby Search (id, name, location, types only), up to 5 places.
  Search 1: within 1 km, the must-haves' types. Only if nothing there passes the
  rules, search 2: within 2 km, the must-haves' types + park, museum, tourist
  attraction, café (fallback). No search 2 after Google fails or the limit is hit.
  Cached per ~500 m area (+ radius + types) for 1 h; empty or failed answers only
  10 min. Max 10 searches per trip per day, one phone per stop (pick saved in
  google_cache). Picked by rules, no AI: skip places in the plan, no-gos and
  anything over today's budget left (lowest daily budget − today's stops); must-have
  types first, then nearest; meals only at meal times; halal -> "Halal-friendly ·
  not verified"; price from the place type; must leave >= 20 min there. Nothing
  usable from both searches / Google fails -> "Enjoy the extra time".
  Add this = new stop now, length spare − walk there − walk on (max 60, min 15);
  later stops move only if needed. Go to next stop = offer to move the next stop
  earlier by the spare (5-min steps, never booked stops); decide_early RPC.
- Rain backup (features/today/rain.ts, useRainCheck in the tabs layout, useRainAlert,
  RainCard, screen 10): rain at the group's position within 60 min. Demo mode: the
  route's rain moment (lib/location centre, now()). Otherwise only the weather already
  fetched for the Today card (weather function: current conditions + its `soon`
  forecast hours, read from the React Query cache; never an extra weather call):
  raining now, or a forecast hour within 60 min with rain or a 50%+ chance. Card for
  the stop the group is at if outdoor and it lasts until the rain comes, else the next
  stop if outdoor, still planned and starting within 60 min of the rain. Never booked
  stops. Once per stop (rain_alerts, shared, Realtime). Headline "Rain at [stop] in
  40 min" (blue stripe + umbrella icon), "Nearby, indoor, within budget", up to 3
  options nearest first (name, walk/ride time, ~price, Go) and a Keep plan link.
  Nothing found -> "Rain coming at [stop] — consider moving it" + Keep plan only.
  Options: nearby-suggestion function with kind 'rain' (_shared/nearby.ts
  rainOptionsFor), the running-early search code and rules: indoor types only
  (museum, art gallery, mall, aquarium, cinema, café; restaurants only near a meal
  time at the slot's start); 1 km, then 2 km only if fewer than 3 fit; up to 10
  places per search; same area cache (1 h, empty 10 min), the same 10 nearby
  searches per trip per day, one phone per stop (options saved in google_cache as
  rain-pick:<stop>); skip planned places, no-gos, food needs, over budget (today's
  budget left + the replaced stop's price); must-haves first; halal note on food.
  Go = decide_rain RPC for the group: a stop still to come becomes the place in its
  time slot; at the stop already, it ends now and the place is added for the rest of
  its slot (min 15 min). Keep plan = decide_rain 'keep'.
  Cards stack on Today in this order: late, rain, early, spend.
- Far from group: any member > 500 m from the group centroid -> amber alert.
- Halal labels (features/planning/halal.ts, HalalLabels; stop edit screen + Day plan rows; no
  API calls): food stops (category 'food') show "Halal-friendly · not verified" (small soft grey
  tag, HalalTag, never green: nobody confirmed it) when anyone in the trip needs halal, in any
  country; the running-early and rain cards use the same tag. Food stops in Malaysia (inMalaysia:
  the saved address first, a country or Malaysian state in it, else the location inside rough
  outlines of Peninsular Malaysia / Sabah + Sarawak, Singapore, southern Thailand and Brunei
  kept out) also get a teal "Check halal status on JAKIM →" link: JAKIM's official Malaysia
  Halal Portal search, Food premises, name pre-filled (jakimSearchUrl,
  https://www.halal.gov.my/index.php?data=ZGlyZWN0b3J5L2luZGV4X2RpcmVjdG9yeTs7Ozs=&category=PE&cari=<name>).
  Not outside Malaysia.
- Split & rejoin, group B's own stops (features/group/splitStops.ts, `stops.split_id` ->
  meet_points): during a split, group B's banner (SplitBanner) has "+ Add a stop" under "head
  to X", opening the normal Add a stop screen with ?split=<id> (no day pick; must start and end
  by the rejoin time, splitStopProblem). Group B can add several. useStops is the one filter
  (canSeeStop): a split stop shows only to that split's group B, only once the split was set
  (now(), so Demo Reset hides it), and after the split ends only the ones they visited (still
  planned ones go: everyone continues the normal plan). So it is on group B's Plan and Today
  (amber "Group B" tag, GroupBTag), only their phones tick it off, and only they get its spend
  check ("· N of [group B size]"); group A's plan and Today never change. The running-late,
  running-early and rain checks use mainPlan (split stops left out), so their new days never
  move a group B stop. Demo mode: the replay follows group B's stops for a group B phone; the
  late / early / rain moments are picked from the shared plan only.
- Low battery: < 15% -> amber alert + write last known location to group.
- Spend check (features/money/spend.ts, `spends` table, one row per person per stop
  per day): when the group leaves a stop (or taps "We're done here") -> each person is
  asked once, for themselves, about the stop left last today. Every stop, RM 0 and
  fixed prices too: "About RM X spent?" with the stop's price as the guess. Booked stops
  (hotel, flights): "Spent anything extra at [stop]?", guess RM 0, the amount goes on top
  of the booking price. ✓ = the guess, Enter amount = RM typed (numbers only), Skip keeps
  the guess. Answered -> the stop moves to Done with its final cost ("RM 18"), plus
  "Spent so far RM 52 · 3 of 4" in a group trip. Shown below a late / early card if one is up.
  Demo mode: every leave event says "· spend check"; answers after the fake time are ignored
  (so Reset brings the prompt back).
- Budget bar (per person, this phone's answers): spent = booked stops (+ extras) + amounts
  answered + visited fixed-price stops not answered + extra spends; planned = every stop at
  the answered amount where known, else its price, + extra spends. Visited estimate stops not
  answered or skipped stay planned, not spent. Extra spends ("+ Add spend" on the Plan tab,
  stop_id null, day_number = the selected day, optional note) are each person's own; they
  can delete them.
- Location on: from 60 min before the day's first stop until the member taps
  Done for today.
- Done for today (features/recap, dayEnd.ts, screen 14, `day_closures` table): once the day's
  last stop is finished (left, "We're done here", or its planned end passed; no end time =
  60 min after it starts) the Today tab shows "That's every stop for today" with Done for
  today / Keep going. Keep going (saved on the phone, keepGoing.ts) pins Done for today and
  + Add more stops to the bottom; an added stop opens the day again until it is finished.
  Done for today saves the member's row (closed, closed_at = now(); reopen = closed false,
  an update so Realtime reaches everyone; rows after the fake time don't count, so Reset
  reopens), stops this phone's sharing and GPS reads, and the Today tab says "Day closed.
  See you tomorrow" with Reopen today. "2 of 4 have closed their day" is live.
- Which trip day it is: ALWAYS from useOpenDay (features/recap/hooks/useOpenDay.ts), never
  tripDayOn() directly in live-trip features. Normally the calendar day. After Keep going the
  day carries on past midnight (Today, stops, + Add more stops, sharing) until Done for today;
  never closed, it ends by itself 1 h before the next day's first stop (no timed stops: as if
  it started at 09:00), so the new day starts normally (dayEnd.ts activeTripDay /
  openDayEndsAt). Closed past midnight, Today shows "Day closed" until then. Without Keep
  going the day ends at midnight.
- Location sharing (features/group/hooks/useShareLocation.ts, `locations` table, one new row
  per save): only in the sharing window, 60 min before the day's first stop to the end of the
  day (midnight, or 60 min after the last stop if later; groupMap.ts sharingWindow), extended
  to the auto end after Keep going (dayEnd.ts keptGoingWindow), and never once the member has
  closed the day (dayEnd.ts shareNow). With "Allow all the time" (asked once per
  trip by BackgroundAskCard, after a short explanation; a no keeps foreground-only):
  background updates about every 60 s with screen off, Android notification "TripTrail is
  sharing your location with your group" (features/group/backgroundShare.ts; the task stops
  itself when the window ends); once the last stop is finished it becomes "Still sharing your
  location" / "Tap Done for today in TripTrail when you're finished" (restarted while the app
  is open). Otherwise every 45 s while the app is open. Battery
  dropping below 15% saves straight away. Demo mode never writes positions (the map uses
  the demo route's members). Others' positions: newest row per member, live by Realtime.
- Group map (screen 11, features/group): member circles with initial + battery %, day's
  stops, today's pins (tap: name, who pinned, Directions). Far from group is measured from
  the main cluster's centre (groupMap.ts groupCentre). Low battery: keep the last position,
  marked "last seen [time]" (also any position older than 3 min).
  Done for today on the map (useMapMembers marks `done` from day_closures, also in Demo
  mode by the member id): members who closed their day are a grey circle with "Done for
  today" instead of "last seen", and are left out of the group centre, the far-from-group
  and low-battery alerts (so Split & rejoin too) and the meet point's "everyone's here"
  check. After closing my own day: a banner at the top of the map "You've closed today ·
  location sharing is off" with Reopen today (DayClosedBanner).
- Group tab (no prototype screen; features/group GroupScreen, groupList.ts, useGroupList):
  members in join order, avatar + name, "You" and "Organiser" tags (organiser = trips.created_by,
  else the earliest joiner; trip/members.ts organiserId). Status line: location ("Sharing
  location", "Last seen HH:MM" after 3 min without a new position, "Location off" with none,
  e.g. outside the sharing window; "Done for today" wins), battery % (amber "· low" under 15%).
  No preferences status, and nothing from preferences is loaded. Positions come from useMapMembers, so Demo mode shows the replay's members (real ones
  by id, the made-up "(demo)" ones added with a Demo tag). Invite card: join code + Copy (the
  code) / Share (invite message); decided trips say "The trip is decided. New members will join
  the current plan." Joining a decided trip (JoinScreen) opens the Day plan straight away (no
  preferences or voting); the plan is never changed or rebuilt by a join, and the new member is
  in Today, the map and spend checks like anyone else.
  Leave trip (everyone, organiser too): confirm card "Leave this trip?"; last member: "You're the
  last member. Leaving will delete this trip." trip/api.ts leaveTrip: pin photos first (mine by
  file prefix "<member id>-"; the last member every file in the trip's folder, storage policy
  "pin photos delete last member"), then the leave_trip RPC (security definer, locks the trip):
  deletes my member row (my preferences, votes, spends, pins, positions, closures cascade); the
  last member deletes the trip (everything cascades by trip_id; nearby-pick / rain-pick cache rows
  too) -> 'deleted'; otherwise the organiser role passes to the earliest joiner if the organiser
  left, and trips.members_changed_at = now() (an UPDATE, so Realtime on trips reaches everyone:
  useTripRealtime refreshes trip + members + pins on any trips change; a DELETE can't be
  filtered by trip_id). useLeaveTrip stops background sharing, clears the current trip and goes
  home.
- Home screen: trips whose end_date is before today (lib/clock, so Demo mode's fake date) go
  in a collapsed "Past trips (N)" section under the current and upcoming ones (pastTrips.ts),
  latest first; tapping one still opens it.
- Day recap (screen 15, features/recap: trail.ts, cardLayout.ts, dayWeather.ts, shareImage.ts,
  useDayRecap, RecapCard, DayRecapScreen, route /recap?day=N): a 9:16 story card for one trip
  day, for this person. Opened from "Day closed" (See your day recap) and from the Plan tab's
  "Day recap" link on finished days (dayEnd.ts recapDays: days before the open day, all of them
  after the trip, and the open day once its last stop is finished or closed). No Google or
  Gemini calls.
  The trail drawn is ALWAYS prototype screen 15's line, the same for every trip
  (cardLayout.ts TRAIL_PATH, in the card's 300-wide coordinates; react-native-svg, no map):
  6 px, mint #8FE0D2 → gold #F0A01E left to right, with a soft glow (wide faint copies
  underneath). The real GPS route is NOT drawn. The day's visited stops (arrived by now();
  Demo: also the route's arrive events), in visit order, sit evenly spaced along it by arc
  length: first at its start, last at its end (one stop: the middle). Markers: white circle +
  emoji by category, a few sights by name (stopEmoji); radius 13, smaller when many stops
  share the line (never touching). Every stop's FULL name in a pill (never cut; over 32
  characters wraps onto two lines): straight out from the line on alternating sides (even
  stops one side, odd the other) when there's room, else moved into free space (e.g. above
  the arch, inside the loop) with a thin line from the marker's edge. Pills never cover each
  other, a marker or the line, lines don't run through pills, and everything stays inside the
  card (pills from y 112 to the stats). Start / End tags (small teal pills, a mint dot for
  Start, a gold flag for End), no times: "Start" by the first stop, "End" by the last; one
  stop: a single "Start – End". The tags go through
  the same placement as the pills (they prefer the side of the line their stop's name doesn't
  use), so they never cover a pill, a marker or the line. Search: candidate spots per pill, the most constrained
  pill first with backtracking over a lazily computed clash table; styles tried in turn: one
  line 9.5 → 8 px, then (crowded days) names over 16 characters on two lines 9 → 7 px, then
  6.5 / 6 px; then lines may cross. (Last resort: markers without names.) ~50 ms for 7 stops,
  ~150 ms for 14; the card recomputes it only when the stops change. Pill width is estimated
  a little generously; the text also has adjustsFontSizeToFit so it shrinks rather than cuts.
  Header: the trip name only. One-day trip: card date "WEDNESDAY 11 NOV", screen title "Your
  day"; longer trips "DAY 2 · …" and "Day 2 done".
  Stats stay real. Positions: this person's saved `locations` rows from the day's midnight to
  when it ends (1 h before the next day's first stop, openDayEndsAt), capped at now(); Demo
  mode: the day's demo route (buildDemoRoute from useDemoStops, same as the replay), this
  phone's member every minute up to now(). Jitter smoothing (trail.ts smoothTrail): drop jumps
  reached and left faster than 150 km/h, median of 5 positions (symmetric, so the ends stay
  put), then keep a point only once it is 25 m from the last kept. km = smoothed trail length
  ("3.4", "38"), stops visited, hours out = first to last position ("40m", "6.5h", "13h"),
  weather = what the Today card already fetched (useRecordDayWeather in the tabs layout saves
  it on the phone: the current weather and the reply's forecast hours, one per hour, a real
  reading beats a forecast; the forecast hours are moved onto lib/clock's time, so Demo mode's
  fake day collects them too, a few hours per fetch). Summary (dayWeather.ts weatherSummary)
  over the readings while out (first to last position, the hour it started in counts; all of
  the day's if none fall there): temperature = their median, rounded (typical, not highest);
  words = "mostly [most common sky]" whenever there are several readings, plus ", some rain"
  if any rain was seen ("partly cloudy" stays as it is, already a mix); one reading: just its
  sky ("cloudy"). Left out if none. No
  positions: "–" for km and hours. Share your day = capture at 1080×1920 + share sheet;
  Download = gallery (Android 13+ needs no permission; older asks for storage after our own
  "Save to your gallery?" explanation; blocked -> Open settings).
