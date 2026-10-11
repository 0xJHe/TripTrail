import { clockOf } from '@/features/planning/stops';
import type { Member } from '@/features/trip/types';
import { avatarColors } from '@/lib/theme';
import { LOW_BATTERY, STALE_MS, type MapMember } from './groupMap';

/** Where a member's location stands on the Group tab. */
export type LocationState =
  | { kind: 'sharing' }
  | { kind: 'last-seen'; at: number }
  | { kind: 'off' }
  /** Closed their day (Done for today): sharing is off for the night. */
  | { kind: 'done' };

/** answered = preferences in; joined-after = joined once the plan was built (skips preferences). */
export type PrefsState = 'answered' | 'not-yet' | 'joined-after';

/** One line in the Group tab's members list. Never holds anyone's budget or other answers. */
export interface GroupRow {
  id: string;
  name: string;
  color: string;
  isMe: boolean;
  organiser: boolean;
  /** A made-up member of the Demo mode replay. */
  demo: boolean;
  location: LocationState;
  battery: number | null;
  prefs: PrefsState;
}

export interface GroupRowsInput {
  /** The trip's members, in join order. */
  members: Pick<Member, 'id' | 'display_name'>[];
  meId: string | null;
  organiserId: string | null;
  /** Positions on the group map (useMapMembers: the replay's members in Demo mode). */
  placed: MapMember[];
  /** Members who closed today (Done for today). */
  closed: Set<string>;
  /** Members who answered preferences. */
  answered: Set<string>;
  /** The plan is built (stage 'decided'). */
  decided: boolean;
  demo: boolean;
  /** now() in ms. */
  time: number;
}

/**
 * Members list for the Group tab, in join order; in Demo mode the replay's made-up members
 * follow, with their fake position, battery and Done for today.
 */
export function groupRows(input: GroupRowsInput): GroupRow[] {
  const { members, meId, organiserId, placed, closed, answered, decided, demo, time } = input;
  const ids = new Set(members.map((m) => m.id));
  const posOf = (id: string, isMe: boolean) => placed.find((p) => p.id === id) ?? (isMe ? placed.find((p) => p.isMe) : undefined);
  const rows: GroupRow[] = members.map((m, i) => {
    const isMe = m.id === meId;
    const pos = posOf(m.id, isMe);
    return {
      id: m.id,
      name: m.display_name,
      color: avatarColors[i % avatarColors.length],
      isMe,
      organiser: m.id === organiserId,
      demo: false,
      location: locationState(pos, isMe, closed.has(m.id), time),
      battery: pos?.battery ?? null,
      prefs: answered.has(m.id) ? 'answered' : decided ? 'joined-after' : 'not-yet',
    };
  });
  if (!demo) return rows;
  const fake = placed.filter((p) => !p.isMe && !ids.has(p.id));
  return [
    ...rows,
    ...fake.map((p, i) => ({
      id: p.id,
      name: p.name,
      color: avatarColors[(members.length + i) % avatarColors.length],
      isMe: false,
      organiser: false,
      demo: true,
      location: locationState(p, false, closed.has(p.id) || !!p.done, time),
      battery: p.battery,
      prefs: 'answered' as const,
    })),
  ];
}

/** Done for today wins; no position = off; others go "last seen" after 3 min without a new one. */
export function locationState(pos: MapMember | undefined, isMe: boolean, done: boolean, time: number): LocationState {
  if (done) return { kind: 'done' };
  if (!pos) return { kind: 'off' };
  if (!isMe && time - pos.seenAt > STALE_MS) return { kind: 'last-seen', at: pos.seenAt };
  return { kind: 'sharing' };
}

/** "Sharing location", "Last seen 14:20", "Location off", "Done for today". */
export function locationText(state: LocationState): string {
  switch (state.kind) {
    case 'sharing':
      return 'Sharing location';
    case 'last-seen':
      return `Last seen ${clockOf(new Date(state.at).toISOString())}`;
    case 'done':
      return 'Done for today';
    default:
      return 'Location off';
  }
}

/** "84%", null when unknown. */
export function batteryText(battery: number | null): string | null {
  return battery == null ? null : `${battery}%`;
}

export const isLowBattery = (battery: number | null) => battery != null && battery < LOW_BATTERY;

/** "Preferences in", "No preferences yet", "Joined after the plan". */
export function prefsText(state: PrefsState): string {
  if (state === 'answered') return 'Preferences in';
  if (state === 'joined-after') return 'Joined after the plan';
  return 'No preferences yet';
}

/** "4 members", "Just you", "4 members · 2 demo". */
export function groupCountLabel(rows: Pick<GroupRow, 'demo'>[]): string {
  const real = rows.filter((r) => !r.demo).length;
  const demo = rows.length - real;
  const base = real <= 1 ? 'Just you' : `${real} members`;
  return demo > 0 ? `${base} · ${demo} demo` : base;
}

/** The confirm step's second line. */
export function leaveText(lastMember: boolean): string {
  return lastMember
    ? "You're the last member. Leaving will delete this trip."
    : 'The trip disappears from your home screen. Your answers, spends and pins in it are removed.';
}
