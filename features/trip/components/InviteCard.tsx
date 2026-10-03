import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, View } from 'react-native';

import { Avatars, type AvatarItem } from '@/components/ui/Avatars';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily } from '@/lib/theme';
import { inviteMessage } from '../invite';

interface InviteCardProps {
  people: AvatarItem[];
  myName: string;
  joinCode: string;
  tripName: string;
  /** Saves the trip if needed; returns the real join code, or null if the form isn't ready. */
  beforeShare: () => Promise<string | null>;
}

/** "Invite your group" card: who has joined, the join code, Copy / WhatsApp / Share. */
export function InviteCard({ people, myName, joinCode, tripName, beforeShare }: InviteCardProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function withMessage(send: (message: string) => Promise<unknown>) {
    const code = await beforeShare();
    if (!code) return;
    await send(inviteMessage(tripName.trim(), code));
  }

  const copy = () =>
    withMessage(async (message) => {
      await Clipboard.setStringAsync(message);
      setCopied(true);
    });

  const whatsApp = () =>
    withMessage(async (message) => {
      const text = encodeURIComponent(message);
      try {
        await Linking.openURL(`whatsapp://send?text=${text}`);
      } catch {
        await Linking.openURL(`https://wa.me/?text=${text}`);
      }
    });

  const share = () => withMessage((message) => Share.share({ message }));

  return (
    <Card style={styles.card}>
      <View style={styles.between}>
        <Avatars people={people} plus />
        <Txt variant="s11">
          {people.length} joined · you're {myName}
        </Txt>
      </View>
      <View style={[styles.between, styles.codeRow]}>
        <Txt variant="b12" color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
          Join code{'  '}
          <Txt variant="b12" style={styles.code} color={colors.text}>
            {joinCode}
          </Txt>
        </Txt>
        <Pressable
          onPress={copy}
          accessibilityRole="button"
          accessibilityLabel="Copy invite"
          hitSlop={6}
          style={({ pressed }) => [styles.copy, pressed && { opacity: 0.85 }]}>
          {copied ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
          <Txt style={styles.copyText} color={colors.white}>
            {copied ? 'Copied' : 'Copy'}
          </Txt>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Button
          label="WhatsApp"
          variant="secondary"
          size="sm"
          onPress={whatsApp}
          icon={<Ionicons name="logo-whatsapp" size={16} color={colors.text} />}
          style={{ flex: 1 }}
        />
        <Button
          label="Share link"
          variant="secondary"
          size="sm"
          onPress={share}
          icon={<Ionicons name="share-outline" size={16} color={colors.text} />}
          style={{ flex: 1 }}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  codeRow: { backgroundColor: colors.background, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  code: { fontFamily: fontFamily.mono, letterSpacing: 0.5 },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.teal,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  copyText: { fontFamily: fontFamily.medium, fontSize: 11, lineHeight: 14 },
  row: { flexDirection: 'row', gap: 10 },
});
