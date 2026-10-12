import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily } from '@/lib/theme';
import { HALAL_TAG, JAKIM_LINK, halalLabels, jakimSearchUrl } from '../halal';
import type { Stop } from '../types';

/** Small soft grey "Halal-friendly · not verified" tag (grey, not green: nobody has confirmed it). */
export function HalalTag() {
  return (
    <View style={styles.tag} testID="halal-tag">
      <Txt style={styles.tagText} color={colors.textMuted}>
        {HALAL_TAG}
      </Txt>
    </View>
  );
}

/** Teal "Check halal status →": JAKIM's official halal search with the name filled in. */
export function JakimLink({ name }: { name: string }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(jakimSearchUrl(name)).catch(() => {})}
      hitSlop={8}
      accessibilityRole="link"
      accessibilityLabel={`Check halal status of ${name} on JAKIM`}
      style={({ pressed }) => pressed && { opacity: 0.6 }}
      testID="jakim-link">
      <Txt variant="b12" weight="semibold" color={colors.tealDark}>
        {JAKIM_LINK}
      </Txt>
    </Pressable>
  );
}

interface HalalLabelsProps {
  stop: Pick<Stop, 'name' | 'category' | 'address' | 'lat' | 'lng'>;
  /** At least one person in the trip chose halal in their preferences. */
  needsHalal: boolean;
}

/** Day plan / Edit stop: a food stop's halal tag (+ JAKIM link in Malaysia) when someone needs halal (features/planning/halal.ts). */
export function HalalLabels({ stop, needsHalal }: HalalLabelsProps) {
  const { tag, jakim } = halalLabels(stop, needsHalal);
  if (!tag && !jakim) return null;
  return (
    <View style={styles.row}>
      {tag ? <HalalTag /> : null}
      {jakim && stop.name.trim() ? <JakimLink name={stop.name} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tag: { alignSelf: 'flex-start', backgroundColor: colors.chip, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  tagText: { fontFamily: fontFamily.semibold, fontSize: 10, lineHeight: 14 },
});
