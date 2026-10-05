import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { clockOf } from '@/features/planning/stops';
import { directionsUrl } from '@/features/today/todayPlan';
import { colors, fontFamily } from '@/lib/theme';
import { pinTitle } from '../pins';
import type { PinWithPhoto } from '../types';

interface PinRowProps {
  pin: PinWithPhoto;
  by: string;
  distance: string | null;
  /** null = today isn't a trip day, so it can't be added. */
  onAdd: (() => void) | null;
  added: boolean;
  adding: boolean;
}

/** One pin in "Pinned so far today": spots can be added to the plan, every pin has directions. */
export function PinRow({ pin, by, distance, onAdd, added, adding }: PinRowProps) {
  const title = pinTitle(pin);
  const spot = pin.type === 'spot';
  const directions = () =>
    Linking.openURL(directionsUrl({ lat: pin.lat, lng: pin.lng, name: title, address: null })).catch(() => {});
  return (
    <Card style={styles.row}>
      {pin.photoLink ? (
        <Image source={{ uri: pin.photoLink }} style={styles.icon} contentFit="cover" accessibilityLabel={`Photo of ${title}`} />
      ) : (
        <View style={[styles.icon, { backgroundColor: spot ? '#FDEDEB' : '#E8F0FB' }]}>
          <Txt style={{ fontSize: 18 }}>{spot ? '📍' : '🚗'}</Txt>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Txt variant="h14" numberOfLines={1}>
          {title}
        </Txt>
        <Txt variant="s11" style={{ marginTop: 2 }}>
          {[by, clockOf(pin.created_at), distance].filter(Boolean).join(' · ')}
        </Txt>
      </View>
      {spot ? (
        <>
          <Pressable
            onPress={directions}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Directions to ${title}`}>
            <Ionicons name="navigate-outline" size={20} color={colors.textMuted} />
          </Pressable>
          {added ? (
            <View style={[styles.pill, styles.ghost]}>
              <Ionicons name="checkmark" size={13} color={colors.green} />
              <Txt style={styles.pillText} color={colors.green}>
                In plan
              </Txt>
            </View>
          ) : onAdd ? (
            <Pressable
              onPress={adding ? undefined : onAdd}
              accessibilityRole="button"
              accessibilityLabel={`Add ${title} to today's plan`}
              style={({ pressed }) => [styles.pill, pressed && { opacity: 0.85 }]}>
              {adding ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Txt style={styles.pillText} color={colors.white}>
                  Add to plan
                </Txt>
              )}
            </Pressable>
          ) : null}
        </>
      ) : (
        <Pressable
          onPress={directions}
          accessibilityRole="button"
          accessibilityLabel={`Directions to ${title}`}
          style={({ pressed }) => [styles.pill, styles.ghost, pressed && { opacity: 0.85 }]}>
          <Txt style={styles.pillText}>Directions</Txt>
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.teal,
  },
  ghost: { backgroundColor: colors.chip },
  pillText: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 15 },
});
