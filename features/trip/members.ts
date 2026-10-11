import type { AvatarItem } from '@/components/ui/Avatars';
import { avatarColors } from '@/lib/theme';
import type { Member } from './types';

/** Colour by join order, so everyone sees the same colour for the same person. */
export function memberColor(members: Member[], memberId: string): string {
  const index = members.findIndex((m) => m.id === memberId);
  return avatarColors[Math.max(0, index) % avatarColors.length];
}

export function memberAvatars(members: Member[], muted?: (m: Member) => boolean): AvatarItem[] {
  return members.map((m, i) => ({
    key: m.id,
    name: m.display_name,
    color: avatarColors[i % avatarColors.length],
    muted: muted?.(m),
  }));
}

/** "4 members", "Just you". */
export function memberCountLabel(count: number): string {
  if (count <= 1) return 'Just you';
  return `${count} members`;
}

/**
 * The organiser's member id: whoever trips.created_by points to (passed to the earliest joiner
 * when the organiser leaves, leave_trip), else the earliest joiner (`members` in join order).
 */
export function organiserId(members: Pick<Member, 'id' | 'user_id'>[], createdBy: string | null | undefined): string | null {
  return members.find((m) => m.user_id === createdBy)?.id ?? members[0]?.id ?? null;
}
