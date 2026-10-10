import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, shadow } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Centre-on-group and + / − buttons over the map's bottom right (prototype screen 11). */
export function ZoomControls({ onCentre, onZoom }: { onCentre: () => void; onZoom: (inOut: 1 | -1) => void }) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.box}>
        <Key icon="locate" label="Centre on the group" onPress={onCentre} />
      </View>
      <View style={styles.box}>
        <Key icon="add" label="Zoom in" onPress={() => onZoom(1)} />
        <View style={styles.sep} />
        <Key icon="remove" label="Zoom out" onPress={() => onZoom(-1)} />
      </View>
    </View>
  );
}

function Key({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.key} hitSlop={4}>
      <Ionicons name={icon} size={18} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 12, bottom: 12, gap: 8 },
  box: { width: 36, borderRadius: 10, backgroundColor: colors.white, ...shadow },
  key: { height: 36, alignItems: 'center', justifyContent: 'center' },
  sep: { height: 1, marginHorizontal: 6, backgroundColor: colors.border },
});
