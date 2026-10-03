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
  /** Shown in the top-right corner, level with the brand row. */
  right?: ReactNode;
  children?: ReactNode;
}

/** Gradient header with the dashed trail, from the prototype's create-trip screen. */
export function HeroHeader({ title, subtitle, brand, onBack, right, children }: HeroHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <TrailBackdrop style={[styles.wrap, { paddingTop: insets.top + 12 }]}>
      {onBack && !brand ? <BackButton onPress={onBack} /> : null}
      {brand ? (
        <View style={styles.brand}>
          {onBack ? <BackButton onPress={onBack} inline /> : null}
          <Image source={logo} style={styles.logo} contentFit="contain" accessibilityLabel="TripTrail logo" />
          <View>
            <Txt style={styles.brandName} color={colors.white}>
              TripTrail
            </Txt>
            <Txt variant="b12" color={colors.textOnNavy} style={{ marginTop: 3 }}>
              The plan that follows you
            </Txt>
          </View>
          {right ? <View style={styles.right}>{right}</View> : null}
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

const styles = StyleSheet.create({
  backInline: { marginLeft: -6, marginRight: -4 },
  wrap: { paddingHorizontal: 18, paddingBottom: 22 },
  back: { alignSelf: 'flex-start', marginLeft: -6, marginBottom: 10 },
  right: { marginLeft: 'auto' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  logo: { width: 40, height: 40 },
  brandName: { fontFamily: fontFamily.extrabold, fontSize: 24, letterSpacing: -0.5, lineHeight: 26 },
  title: { fontFamily: fontFamily.bold, fontSize: 19, letterSpacing: -0.2, lineHeight: 24 },
});
