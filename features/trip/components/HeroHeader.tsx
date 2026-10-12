import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrailBackdrop } from '@/components/ui/TrailBackdrop';
import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily } from '@/lib/theme';

const logo = require('@/assets/images/logo.png');

interface HeroHeaderProps {
  title: string;
  subtitle?: string;
  /** Show the logo + "TripTrail" brand row (prototype screen 1). */
  brand?: boolean;
  onBack?: () => void;
  /**
   * Buttons for the top-right corner (Settings, Sign out). They get their own row above the brand
   * row, right-aligned, so on a small phone they never push each other (or the brand) off screen;
   * if they still don't fit side by side (large font size) they wrap.
   */
  right?: ReactNode;
  children?: ReactNode;
}

/**
 * Gradient header with the dashed trail, from the prototype's create-trip screen. Keeps clear of
 * the status bar and side cutouts (safe area); the greeting wraps rather than crowding the buttons.
 */
export function HeroHeader({ title, subtitle, brand, onBack, right, children }: HeroHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <TrailBackdrop
      style={[
        styles.wrap,
        { paddingTop: insets.top + 12, paddingLeft: insets.left + PAD, paddingRight: insets.right + PAD },
      ]}>
      {right ? <View style={styles.right}>{right}</View> : null}
      {onBack && !brand ? <BackButton onPress={onBack} /> : null}
      {brand ? (
        <View style={styles.brand}>
          {onBack ? <BackButton onPress={onBack} inline /> : null}
          <Image source={logo} style={styles.logo} contentFit="contain" accessibilityLabel="TripTrail logo" />
          <View style={styles.brandText}>
            <Txt style={styles.brandName} color={colors.white}>
              TripTrail
            </Txt>
            <Txt variant="b12" color={colors.textOnNavy} style={{ marginTop: 3 }}>
              The plan that follows you
            </Txt>
          </View>
        </View>
      ) : null}
      <Txt style={[styles.title, brand && { marginTop: 22 }]} color={colors.white}>
        {title}
      </Txt>
      {subtitle ? (
        <Txt variant="b12" color={colors.textOnNavy} style={{ marginTop: 3 }}>
          {subtitle}
        </Txt>
      ) : null}
      {children}
    </TrailBackdrop>
  );
}

function BackButton({ onPress, inline }: { onPress: () => void; inline?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={inline ? styles.backInline : styles.back}>
      <Ionicons name="chevron-back" size={22} color={colors.white} />
    </Pressable>
  );
}

/** Space from the screen edge (plus the safe-area inset). */
const PAD = 18;

const styles = StyleSheet.create({
  backInline: { marginLeft: -6, marginRight: -4 },
  wrap: { paddingBottom: 22 },
  back: { alignSelf: 'flex-start', marginLeft: -6, marginBottom: 10 },
  right: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginBottom: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  logo: { width: 40, height: 40 },
  brandText: { flexShrink: 1 },
  brandName: { fontFamily: fontFamily.extrabold, fontSize: 24, letterSpacing: -0.5, lineHeight: 26 },
  title: { fontFamily: fontFamily.bold, fontSize: 19, letterSpacing: -0.2, lineHeight: 24 },
});
