import type { DemoSession } from '@/lib/demo';
import { DEMO_OFF } from '@/lib/demo';
import { eventsAround, type DemoRoute } from '@/lib/location';

/** A `demo_sessions` row (the trip's shared demo). */
export interface DemoSessionRow {
  trip_id: string;
  enabled: boolean;
  fake_time: string | null;
  day: number | null;
  event_at: string | null;
  start_time: string | null;
  step: number;
  reset_at: string | null;
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);

/** The row as lib/demo's mirror; no row = Demo mode off. */
export function sessionFromRow(row: DemoSessionRow | null | undefined): DemoSession {
  if (!row) return DEMO_OFF;
  return {
    enabled: row.enabled,
    fakeTime: ms(row.fake_time),
    day: row.day,
    eventAt: ms(row.event_at),
    startTime: ms(row.start_time),
    step: row.step,
    resetAt: row.reset_at,
  };
}

/**
 * Whether an incoming copy of the shared demo should replace the one this phone has: a
 * different trip, or the same step or newer (a slow reply never puts back an older state).
 */
export function isNewer(current: { tripId: string | null; step: number }, tripId: string, incoming: DemoSession): boolean {
  return current.tripId !== tripId || incoming.step >= current.step;
}

/** Someone reset the trip's demo since this phone last looked (not on first load). */
export function isNewReset(current: { tripId: string | null; resetAt: string | null }, tripId: string, incoming: DemoSession): boolean {
  return current.tripId === tripId && incoming.resetAt != null && incoming.resetAt !== current.resetAt;
}

export const YOUR_TURN = 'Your turn: tap Done for today or Keep going';
export const YOUR_TURN_KEPT = 'Your turn: tap Done for today';
/** Next day waits for every real member's Done for today. */
export const waitingText = (n: number) => `Waiting for ${n} to finish their day`;

/** What the debug bar's middle button does at fake time t. */
export type NextAction =
  | { kind: 'event'; label: string; at: number }
  | { kind: 'yourTurn'; label: string }
  | { kind: 'nextDay'; label: string; at: number }
  | { kind: 'waiting'; label: string }
  | { kind: 'none'; label: string };

/**
 * Next event until the day's last event ("That's every stop for today"). Then the demo never
 * chooses for the person: "Your turn" (does nothing) until they tap Done for today; Keep
 * going doesn't count (still their turn, to tap Done for today later; stops they add bring
 * events again). Next day only once every real member of the trip has closed the day
 * ("Waiting for N to finish their day" until then; `stillOpen` = real members who haven't,
 * null while the member list is loading).
 */
export function nextAction(
  route: DemoRoute | null,
  t: number,
  { closedByMe, keptGoing, stillOpen }: { closedByMe: boolean; keptGoing: boolean; stillOpen: number | null },
): NextAction {
  if (!route) return { kind: 'none', label: 'Next event' };
  const end = route.events.find((e) => e.kind === 'end');
  if (!end || end.at > t) {
    const { next } = eventsAround(route, t);
    if (next) return { kind: 'event', label: 'Next event', at: next.at };
  }
  if (!closedByMe) return { kind: 'yourTurn', label: keptGoing ? YOUR_TURN_KEPT : YOUR_TURN };
  if (stillOpen == null) return { kind: 'none', label: 'Next day' };
  if (stillOpen > 0) return { kind: 'waiting', label: waitingText(stillOpen) };
  if (route.nextDayStartsAt != null) return { kind: 'nextDay', label: 'Next day', at: route.nextDayStartsAt };
  return { kind: 'none', label: 'Last day done' };
}

/** The last demo event at or before t on this route (saved with each step), null = none. */
export function lastEventAt(route: DemoRoute | null, t: number): number | null {
  return route ? (eventsAround(route, t).last?.at ?? null) : null;
}
