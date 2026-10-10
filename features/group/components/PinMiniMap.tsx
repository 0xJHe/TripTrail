import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { Txt } from '@/components/ui/Txt';
import type { LatLng } from '@/lib/distance';
import { colors, fontFamily } from '@/lib/theme';
import type { Pin } from '../types';
import { PinMarker, useMarkerTracks } from './MapMarkers';

const HEIGHT = 200;
/** About 500 m across: enough to see the street and nearby pins. */
const DELTA = 0.005;
// Fixed marker box (Android clips custom markers to their own size): label tag, gap, red pin.
const DROP_W = 180;
const TAG_H = 22;
const PIN_ICON = 34;
const DROP_H = TAG_H + 2 + PIN_ICON;

interface PinMiniMapProps {
  /** This phone's position: where the pin drops. null = still finding it. */
  here: LatLng | null;
  /** "📍 Cendol stall" as it's typed, "📍 Pin drops here" while the name is empty. */
  label: string;
  /** Today's pins, shown with their names. */
  pins: Pin[];
}

/** Small map above "Pin drops here" (prototype screen 13): the new pin at your position and today's pins. */
export function PinMiniMap({ here, label, pins }: PinMiniMapProps) {
  const map = useRef<MapView>(null);
  const centre = () => {
    if (here) map.current?.animateCamera({ center: { latitude: here.lat, longitude: here.lng } }, { duration: 300 });
  };
  // Follow this phone as it moves (the demo route too), not on every tiny change.
  const key = here ? `${here.lat.toFixed(4)},${here.lng.toFixed(4)}` : '';
  const centreRef = useRef(centre);
  centreRef.current = centre;
  useEffect(() => {
    if (key) centreRef.current();
  }, [key]);

  if (!here) {
    return (
      <View style={[styles.box, styles.waiting]} testID="pin-mini-map">
        <Txt variant="s11">Finding your location…</Txt>
      </View>
    );
  }
  return (
    <View style={styles.box} testID="pin-mini-map">
      <MapView
        ref={map}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: here.lat, longitude: here.lng, latitudeDelta: DELTA, longitudeDelta: DELTA }}
        toolbarEnabled={false}
        showsCompass={false}
        rotateEnabled={false}
        pitchEnabled={false}
        moveOnMarkerPress={false}
        userInterfaceStyle="light">
        {pins.map((p) => (
          <PinMarker key={p.id} pin={p} selected={false} showName />
        ))}
        <DropMarker at={here} label={label} />
      </MapView>
      <Pressable
        onPress={centre}
        accessibilityRole="button"
        accessibilityLabel="Back to where the pin drops"
        style={({ pressed }) => [styles.recentre, pressed && { opacity: 0.8 }]}>
        <Ionicons name="locate" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

/** The red pin where the new pin will drop, with a navy tag showing its name. */
function DropMarker({ at, label }: { at: LatLng; label: string }) {
  const { tracks, onLayout } = useMarkerTracks(label);
  return (
    <Marker
      coordinate={{ latitude: at.lat, longitude: at.lng }}
      anchor={{ x: 0.5, y: (DROP_H - 3) / DROP_H }}
      tracksViewChanges={tracks}
      zIndex={50}
      tappable={false}
      accessibilityLabel={label}>
      <View style={styles.drop} collapsable={false} onLayout={onLayout}>
        <View style={styles.tag}>
          <Txt style={styles.tagText} color={colors.white} numberOfLines={1}>
            {label}
          </Txt>
        </View>
        <Ionicons name="location" size={PIN_ICON} color={colors.red} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  box: {
    height: HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.backdrop,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  waiting: { alignItems: 'center', justifyContent: 'center' },
  recentre: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  drop: { width: DROP_W, height: DROP_H, alignItems: 'center', gap: 2, overflow: 'hidden' },
  tag: {
    height: TAG_H,
    maxWidth: DROP_W,
    paddingHorizontal: 10,
    borderRadius: TAG_H / 2,
    backgroundColor: colors.navy,
    justifyContent: 'center',
  },
  tagText: { fontFamily: fontFamily.bold, fontSize: 11, lineHeight: 14 },
});
