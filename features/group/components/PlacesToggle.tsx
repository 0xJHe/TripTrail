import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily, shadow } from '@/lib/theme';

/** "Show places" pill over the map's top left: brings back Google's places and business icons. */
export function PlacesToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!on)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="Show places"
      hitSlop={6}
      style={[styles.pill, on && styles.on]}>
      <Ionicons name={on ? 'storefront' : 'storefront-outline'} size={14} color={on ? colors.white : colors.text} />
      <Txt style={styles.text} color={on ? colors.white : colors.text}>
        Show places
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.white,
    ...shadow,
  },
  on: { backgroundColor: colors.teal },
  text: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16 },
});
