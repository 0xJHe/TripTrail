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
