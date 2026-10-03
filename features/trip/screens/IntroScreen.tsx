import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { TrailBackdrop } from '@/components/ui/TrailBackdrop';
import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily } from '@/lib/theme';

const logo = require('@/assets/images/logo.png');

const POINTS: { icon: ComponentProps<typeof Ionicons>['name']; title: string; text: string }[] = [
  { icon: 'people', title: 'Plan together', text: 'Everyone adds a budget, free days and must-haves.' },
  { icon: 'heart', title: 'Swipe to decide', text: 'Like or pass on trip ideas. Most likes wins.' },
  { icon: 'navigate', title: 'Stays on track', text: 'The plan adjusts when you run late or it rains.' },
];

export function IntroScreen() {
  const insets = useSafeAreaInsets();
  return (
    <TrailBackdrop style={{ flex: 1 }} trailTop={insets.top + 190}>
      <View style={[styles.body, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.brand}>
          <Image source={logo} style={styles.logo} contentFit="contain" accessibilityLabel="TripTrail logo" />
          <Txt style={styles.name} color={colors.white}>
            TripTrail
          </Txt>
          <Txt variant="b13" color={colors.textOnNavy} style={{ fontSize: 15 }}>
            The plan that follows you
          </Txt>
        </View>

        <View style={styles.points}>
          {POINTS.map((p) => (
            <View key={p.title} style={styles.point}>
              <View style={styles.pointIcon}>
                <Ionicons name={p.icon} size={18} color="#8FE0D2" />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="h14" color={colors.white}>
                  {p.title}
                </Txt>
                <Txt variant="b12" color={colors.textOnNavy}>
                  {p.text}
                </Txt>
              </View>
            </View>
          ))}
        </View>

        <View style={{ gap: 10 }}>
          <Button label="Get started" onPress={() => router.push('/sign-in')} testID="get-started" />
          <Txt variant="s11" color={colors.textOnNavy} style={{ textAlign: 'center' }}>
            No account or password. Just your name.
          </Txt>
        </View>
      </View>
    </TrailBackdrop>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  brand: { alignItems: 'center', gap: 6 },
  logo: {
    width: 104,
    height: 104,
    marginBottom: 14,
  },
  name: { fontFamily: fontFamily.extrabold, fontSize: 36, letterSpacing: -0.8, lineHeight: 42 },
  points: { gap: 16, paddingHorizontal: 4 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pointIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
