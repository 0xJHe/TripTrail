import { StyleSheet, View } from 'react-native';

import { Avatars } from '@/components/ui/Avatars';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Txt } from '@/components/ui/Txt';
import { memberAvatars } from '@/features/trip/members';
import type { Member } from '@/features/trip/types';

/** "2 of 4 have answered" with coloured avatars for those who have, grey for the rest. */
export function AnsweredCard({
  members,
  doneIds,
  verb = 'have answered',
}: {
  members: Member[];
  doneIds: Set<string>;
  verb?: string;
}) {
  const done = members.filter((m) => doneIds.has(m.id)).length;
  return (
    <Card style={styles.card}>
      <View style={styles.between}>
        <Txt variant="b12" weight="semibold">
          {members.length <= 1 ? (done ? "You've answered" : 'Waiting for your answers') : `${done} of ${members.length} ${verb}`}
        </Txt>
        <Avatars people={memberAvatars(members, (m) => !doneIds.has(m.id))} />
      </View>
      <ProgressBar value={members.length ? done / members.length : 0} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, paddingVertical: 9 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
