import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { inviteMessage } from '@/features/trip/invite';
import { colors, fontFamily } from '@/lib/theme';

interface GroupInviteCardProps {
  tripName: string;
  joinCode: string;
  /** The plan is built: new members join it as it is. */
  decided: boolean;
}

/** Group tab: the join code with Copy and Share, and a note once the trip is decided. */
export function GroupInviteCard({ tripName, joinCode, decided }: GroupInviteCardProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    await Clipboard.setStringAsync(joinCode);
    setCopied(true);
  };
  const share = () => Share.share({ message: inviteMessage(tripName, joinCode) }).catch(() => {});

  return (
    <Card style={styles.card}>
      <Txt variant="sec">Invite people</Txt>
      <View style={styles.codeRow}>
        <Txt variant="b12" color={colors.textMuted}>
          Join code
        </Txt>
        <Txt variant="h17" style={styles.code} selectable testID="group-join-code">
          {joinCode}
        </Txt>
      </View>
      {decided ? (
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={colors.tealDark} />
          <Txt variant="b12" style={{ flex: 1 }}>
            The trip is decided. New members will join the current plan.
          </Txt>
        </View>
      ) : null}
      <View style={styles.row}>
        <Button
          label={copied ? 'Copied' : 'Copy'}
          variant="secondary"
          size="sm"
          onPress={copy}
          icon={<Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={colors.text} />}
          style={{ flex: 1 }}
          testID="group-copy-code"
        />
        <Button
          label="Share"
          variant="secondary"
          size="sm"
          onPress={share}
          icon={<Ionicons name="share-outline" size={16} color={colors.text} />}
          style={{ flex: 1 }}
          testID="group-share-code"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  code: { fontFamily: fontFamily.mono, letterSpacing: 0.5 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  row: { flexDirection: 'row', gap: 10 },
});
