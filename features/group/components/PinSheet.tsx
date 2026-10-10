import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { clockOf } from '@/features/planning/stops';
import { directionsUrl } from '@/features/today/todayPlan';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { colors } from '@/lib/theme';
import { pinTitle } from '../pins';
import type { PinWithPhoto } from '../types';

interface PinSheetProps {
  pin: PinWithPhoto;
  /** "Aisha", "You". */
  by: string;
  /** "400 m away", null without a position. */
  distance: string | null;
  onClose: () => void;
  /** Open the photo full screen. */
  onPhoto: () => void;
  /** null = not my pin, so no delete. */
  onDelete: (() => void) | null;
  deleting: boolean;
  error: string | null;
}

/** A tapped pin on the group map: its name, who pinned it, Directions, and Delete for my own pins. */
export function PinSheet({ pin, by, distance, onClose, onPhoto, onDelete, deleting, error }: PinSheetProps) {
  const title = pinTitle(pin);
  const spot = pin.type === 'spot';
  const directions = () =>
    Linking.openURL(directionsUrl({ lat: pin.lat, lng: pin.lng, name: title, address: null })).catch(() => {});
  return (
    <Card style={styles.card} testID="pin-sheet">
      <View style={styles.row}>
        {pin.photoLink ? (
          <Pressable onPress={onPhoto} hitSlop={4} accessibilityRole="imagebutton" accessibilityLabel={`Open the photo of ${title}`}>
            <Image source={{ uri: pin.photoLink }} style={styles.icon} contentFit="cover" />
          </Pressable>
        ) : (
          <View style={[styles.icon, { backgroundColor: spot ? '#FDEDEB' : '#E8F0FB' }]}>
            <Txt style={{ fontSize: 18 }}>{spot ? '📍' : '🚗'}</Txt>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Txt variant="h14" numberOfLines={2}>
            {title}
          </Txt>
          <Txt variant="s11" style={{ marginTop: 2 }}>
            {[`${spot ? 'Spot' : 'Vehicle'} pinned by ${by}`, clockOf(pin.created_at), distance].filter(Boolean).join(' · ')}
          </Txt>
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
      {error ? <ErrorLine message={error} /> : null}
      <View style={styles.row}>
        <Button
          label="Directions"
          size="sm"
          onPress={directions}
          icon={<Ionicons name="navigate" size={15} color={colors.white} />}
          style={{ flex: 1 }}
        />
        {onDelete ? (
          <Button
            label="Delete"
            size="sm"
            variant="secondary"
            onPress={onDelete}
            loading={deleting}
            icon={<Ionicons name="trash-outline" size={15} color={colors.red} />}
            testID="pin-delete"
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
