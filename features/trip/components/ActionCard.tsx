import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors, radius, shadow } from '@/lib/theme';

interface ActionCardProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
  title: string;
  text: string;
  onPress: () => void;
  testID?: string;
}

/** Big tappable card with an icon tile, title, one line of help and a chevron. */
export function ActionCard({ icon, iconBg, title, text, onPress, testID }: ActionCardProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <View style={[styles.icon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={22} color={colors.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="h15">{title}</Txt>
        <Txt variant="s11" style={{ marginTop: 2 }}>
          {text}
        </Txt>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadow,
  },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
