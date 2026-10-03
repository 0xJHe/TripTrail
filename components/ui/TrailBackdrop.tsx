import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/lib/theme';

/** Navy → teal gradient with the dashed trail from the prototype's create-trip header. */
export function TrailBackdrop({
  children,
  style,
  trailTop = 0,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  trailTop?: number;
}) {
  return (
    <LinearGradient
      colors={[colors.navy, colors.navyMid, colors.navyTeal]}
      locations={[0, 0.55, 1.3]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.wrap, style]}>
      <View style={[StyleSheet.absoluteFill, { top: trailTop, opacity: 0.22 }]} pointerEvents="none">
        <Svg width="100%" height={200} viewBox="0 0 390 200" preserveAspectRatio="xMidYMin slice">
          <Path
            d="M-20 150 C 60 90, 120 190, 200 120 S 320 60, 420 110"
            stroke="#8FE0D2"
            strokeWidth={3}
            fill="none"
            strokeDasharray="6 8"
          />
          <Circle cx={70} cy={122} r={6} fill="#8FE0D2" />
          <Circle cx={200} cy={120} r={6} fill="#8FE0D2" />
          <Circle cx={330} cy={82} r={6} fill="#F0A01E" />
        </Svg>
      </View>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
