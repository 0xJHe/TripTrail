import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, spacing } from '@/lib/theme';

export default function TodayScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Today's stops will show here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  text: { fontSize: fontSize.body, color: colors.textMuted },
});
