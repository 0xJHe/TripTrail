import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { useCurrentTrip } from '@/features/trip/store';
import { colors, fontFamily, shadow } from '@/lib/theme';
import { farMembers, farText } from '../groupMap';
import { useMapMembers } from '../hooks/useMapMembers';
import { useMeetPoints } from '../hooks/useMeetPoints';

/**
 * Today tab: a small amber banner while someone is more than 500 m from the group (the
 * far-from-group rule, as on the map): "Mei is 900 m from the group · Open map". Tapping it
 * opens the Map tab, where Set meet point and Split & rejoin are. Hidden while a meet point
 * or split is going (the map and SplitBanner show those).
 */
export function FarBanner() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const { members, me } = useMapMembers(tripId);
  const { meet, split } = useMeetPoints(tripId, me?.id ?? null);
  const far = useMemo(() => farMembers(members), [members]);
  if (far.length === 0 || meet?.state === 'active' || split?.state === 'active') return null;
  const more = far.length > 1 ? ` (+${far.length - 1} more)` : '';
  return (
    <Pressable
      onPress={() => router.navigate('/map')}
      accessibilityRole="button"
      accessibilityLabel={`${farText(far[0])}${more}. Open map`}
      testID="far-banner"
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={styles.ico}>
        <Ionicons name="warning-outline" size={14} color={colors.amber} />
      </View>
      <Txt style={styles.text} color={colors.amberText} numberOfLines={2}>
        {farText(far[0])}
        {more}
        <Txt style={styles.link} color={colors.tealDark}>
          {' · Open map'}
        </Txt>
      </Txt>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
    borderLeftWidth: 5,
    borderLeftColor: colors.amber,
    ...shadow,
  },
  ico: { width: 26, height: 26, borderRadius: 8, backgroundColor: '#FDF3E1', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, fontFamily: fontFamily.bold, fontSize: 14, lineHeight: 18 },
  link: { fontFamily: fontFamily.bold, fontSize: 14, lineHeight: 18 },
});
