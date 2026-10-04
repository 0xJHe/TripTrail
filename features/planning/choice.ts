import type { Member } from '@/features/trip/types';

/**
 * The trip everyone has chosen, or null while members still disagree or
 * someone hasn't chosen. A solo member's own choice is enough.
 */
export function agreedOption(members: Pick<Member, 'chosen_option_id'>[]): string | null {
  if (members.length === 0) return null;
  const first = members[0].chosen_option_id;
  if (!first) return null;
  return members.every((m) => m.chosen_option_id === first) ? first : null;
}

/** Member ids who chose each option. */
export function choosersByOption(members: Pick<Member, 'id' | 'chosen_option_id'>[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const m of members) {
    if (!m.chosen_option_id) continue;
    map.set(m.chosen_option_id, [...(map.get(m.chosen_option_id) ?? []), m.id]);
  }
  return map;
}

/** The option most members chose (first in `order` on a tie), or null if nobody has chosen. */
export function leadingChoice(members: Pick<Member, 'id' | 'chosen_option_id'>[], order: string[]): { optionId: string; count: number } | null {
  let best: { optionId: string; count: number } | null = null;
  const counts = choosersByOption(members);
  for (const optionId of order) {
    const count = counts.get(optionId)?.length ?? 0;
    if (count > 0 && (!best || count > best.count)) best = { optionId, count };
  }
  return best;
}

/** "3 of 4 chose Penang Food Trail", "Nobody has chosen yet", "You chose Penang". */
export function choiceLine(
  members: Pick<Member, 'id' | 'chosen_option_id'>[],
  names: { id: string; name: string }[],
): string {
  const leading = leadingChoice(
    members,
    names.map((n) => n.id),
  );
  if (!leading) return members.length <= 1 ? 'Choose the trip you want' : 'Nobody has chosen yet';
  const name = names.find((n) => n.id === leading.optionId)?.name ?? 'a trip';
  if (members.length <= 1) return `You chose ${name}`;
  return `${leading.count} of ${members.length} chose ${name}`;
}
