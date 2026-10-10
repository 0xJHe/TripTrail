import { StyleSheet, View } from 'react-native';

import { Avatars } from '@/components/ui/Avatars';
import { Txt } from '@/components/ui/Txt';
import { memberAvatars } from '@/features/trip/members';
import type { Member } from '@/features/trip/types';
import { closedCountLabel } from '../dayEnd';

/** "2 of 4 have closed their day" with coloured avatars for those who have, grey for the rest (live). */
export function ClosedCount({ members, closed }: { members: Member[]; closed: Set<string> }) {
  const count = members.filter((m) => closed.has(m.id)).length;
  return (
    <View style={styles.row} testID="closed-count">
      <Txt variant="s11">{closedCountLabel(count, members.length)}</Txt>
      {members.length > 1 ? <Avatars people={memberAvatars(members, (m) => !closed.has(m.id))} size={24} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
});
