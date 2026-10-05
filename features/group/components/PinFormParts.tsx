import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Chip, Chips } from '@/components/ui/Chip';
import { Txt } from '@/components/ui/Txt';
import type { LatLng } from '@/lib/distance';
import { colors, fontFamily } from '@/lib/theme';
import type { PinType } from '../types';

/** Where the pin will go: this phone's position now (the map comes with the group map). */
export function PinHere({ here, near }: { here: LatLng | null; near: string | null }) {
  return (
    <Card style={styles.here} testID="pin-here">
      <View style={styles.hereIcon}>
        <Ionicons name="location" size={26} color={colors.red} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="h14">Pin drops here</Txt>
        <Txt variant="s11">
          {here
            ? `${near ? `Near ${near} · ` : ''}${here.lat.toFixed(5)}, ${here.lng.toFixed(5)}`
            : 'Finding your location…'}
        </Txt>
      </View>
    </Card>
  );
}

const KINDS: { value: PinType; label: string }[] = [
  { value: 'spot', label: '📍 Spot' },
  { value: 'vehicle', label: '🚗 Vehicle' },
];

/** "What is it?" Spot / Vehicle. */
export function KindPicker({ value, onChange }: { value: PinType; onChange: (v: PinType) => void }) {
  return (
    <Chips>
      {KINDS.map((k) => (
        <Chip key={k.value} label={k.label} selected={value === k.value} onPress={() => onChange(k.value)} />
      ))}
    </Chips>
  );
}

interface PhotoFieldProps {
  photo: string | null;
  onPick: (source: 'camera' | 'library') => void;
  onRemove: () => void;
}

/** "📷 Add a photo · optional", or the picked photo with a remove button. */
export function PhotoField({ photo, onPick, onRemove }: PhotoFieldProps) {
  const ask = () =>
    Alert.alert('Add a photo', undefined, [
      { text: 'Take a photo', onPress: () => onPick('camera') },
      { text: 'Choose from library', onPress: () => onPick('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  if (photo) {
    return (
      <Card style={styles.photoRow}>
        <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" accessibilityLabel="Pin photo" />
        <Txt variant="b13" style={{ flex: 1 }}>
          Photo added
        </Txt>
        <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove photo">
          <Ionicons name="close-circle" size={22} color={colors.textMuted} />
        </Pressable>
      </Card>
    );
  }
  return (
    <Pressable onPress={ask} accessibilityRole="button" accessibilityLabel="Add a photo, optional">
      {({ pressed }) => (
        <Card style={[styles.photoRow, pressed && { opacity: 0.8 }]}>
          <Txt variant="b13" weight="semibold" style={{ flex: 1 }}>
            📷 Add a photo
          </Txt>
          <Txt variant="s11">optional</Txt>
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  here: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hereIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FDEDEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  thumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.chip },
  label: { fontFamily: fontFamily.bold },
});
