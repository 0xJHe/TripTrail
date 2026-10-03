import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radius, shadow } from '@/lib/theme';

/** White rounded card with the prototype's soft shadow. */
export function Card({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.card, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: 13,
    paddingHorizontal: 14,
    ...shadow,
  },
});
