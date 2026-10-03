import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/lib/theme';

/** Primary action pinned to the bottom, fading the content above it. */
export function BottomBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={['rgba(245,247,250,0)', colors.background, colors.background]}
      locations={[0, 0.35, 1]}
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
      {children}
    </LinearGradient>
  );
}

/** Space to leave at the end of a scroll view so the BottomBar doesn't cover it. */
export const BOTTOM_BAR_SPACE = 96;

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 18, paddingHorizontal: 16, gap: 8 },
});
