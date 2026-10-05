import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import type { WeatherKind } from '@/supabase/functions/_shared/weather';
import { colors } from '@/lib/theme';
import type { WeatherText } from '../weather';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<WeatherKind, IconName> = {
  sunny: 'sunny-outline',
  'clear-night': 'moon-outline',
  partly: 'partly-sunny-outline',
  cloudy: 'cloud-outline',
  fog: 'cloud-outline',
  rain: 'rainy-outline',
  storm: 'thunderstorm-outline',
  snow: 'snow-outline',
  wind: 'flag-outline',
};

const WET: WeatherKind[] = ['rain', 'storm', 'snow'];

/** Icon + "32° · sunny · light breeze". `onNavy` = inside the Now block. */
export function WeatherLine({ weather, onNavy }: { weather: WeatherText; onNavy?: boolean }) {
  const wet = WET.includes(weather.kind);
  const sunny = weather.kind === 'sunny' || weather.kind === 'partly';
  // Blue = weather (rain); on navy a lighter blue so it can be seen.
  const iconColor = wet ? (onNavy ? '#8DB8F0' : colors.blue) : sunny ? colors.amber : onNavy ? META : colors.textMuted;
  return (
    <View style={styles.row} accessibilityLabel={`Weather: ${weather.text}`}>
      <Ionicons name={ICONS[weather.kind]} size={onNavy ? 15 : 13} color={iconColor} />
      <Txt
        variant={onNavy ? 'b12' : 's11'}
        color={onNavy ? META : wet ? colors.blue : colors.textMuted}
        weight={wet ? 'semibold' : undefined}
        style={onNavy && styles.navyText}>
        {weather.text}
      </Txt>
    </View>
  );
}

const META = '#C9D8EE';

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  navyText: { fontSize: 12.5, lineHeight: 17 },
});
