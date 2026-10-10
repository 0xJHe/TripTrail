import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';

import { Txt } from '@/components/ui/Txt';
import { timeLabel } from '@/features/planning/stops';
import type { Stop } from '@/features/planning/types';
import type { LatLng } from '@/lib/distance';
import { colors, fontFamily } from '@/lib/theme';
import {
  distanceText,
  firstName,
  lastSeenText,
  LOW_BATTERY,
  memberLabel,
  showLastSeen,
  type FarMember,
  type MapMember,
} from '../groupMap';
import { pinTitle } from '../pins';
import type { Pin } from '../types';

const AVATAR = 34;
const LABEL_GAP = 3;
const LINE = 16;

/**
 * Android draws custom marker views as a picture: let it redraw for a moment after the
 * content changes, then stop (redrawing all the time is slow).
 */
function useTracks(key: string): boolean {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const id = setTimeout(() => setTracks(false), 600);
    return () => clearTimeout(id);
  }, [key]);
  return tracks;
}

const at = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

type Tone = 'me' | 'ok' | 'far' | 'low' | 'stale';
const TONE: Record<Tone, string> = {
  me: colors.navy,
  ok: colors.teal,
  far: colors.amber,
  low: colors.red,
  stale: colors.textMuted,
};

/** A member: coloured circle with their initial, "Aisha · 84%" under it (prototype screen 11). */
export function MemberMarker({ member, far, time }: { member: MapMember; far: boolean; time: number }) {
  const low = member.battery != null && member.battery < LOW_BATTERY;
  const lastSeen = showLastSeen(member, time);
  const tone: Tone = low ? 'low' : far ? 'far' : lastSeen ? 'stale' : member.isMe ? 'me' : 'ok';
  const label = memberLabel(member);
  const seen = lastSeen ? lastSeenText(member) : null;
  const tracks = useTracks(`${tone}|${label}|${seen}`);
  const height = AVATAR + LABEL_GAP + LINE + (seen ? 13 : 0);
  return (
    <Marker
      coordinate={at(member)}
      anchor={{ x: 0.5, y: AVATAR / 2 / height }}
      tracksViewChanges={tracks}
      zIndex={member.isMe ? 30 : 20}
      title={member.isMe ? 'You' : member.name}
      description={[member.battery != null ? `Battery ${member.battery}%` : null, seen].filter(Boolean).join(' · ') || undefined}
      accessibilityLabel={[label, seen].filter(Boolean).join(', ')}>
      <View style={styles.member}>
        <View style={styles.ring}>
          <View style={[styles.avatar, { backgroundColor: TONE[tone] }]}>
            <Txt style={styles.initial} color={colors.white}>
              {(member.isMe ? 'You' : firstName(member.name)).charAt(0).toUpperCase()}
            </Txt>
          </View>
        </View>
        <View style={styles.label}>
          <Txt style={styles.labelText} color={low ? colors.red : colors.text} numberOfLines={1}>
            {label}
          </Txt>
          {seen ? (
            <Txt style={styles.seenText} color={low ? colors.red : colors.textMuted} numberOfLines={1}>
              {seen}
            </Txt>
          ) : null}
        </View>
      </View>
    </Marker>
  );
}

/** A small numbered dot for each of the day's stops; done ones are ticked and grey. */
export function StopMarker({ stop, number }: { stop: Stop; number: number }) {
  const done = stop.status === 'done';
  const tracks = useTracks(`${stop.status}|${number}`);
  if (stop.lat == null || stop.lng == null) return null;
  return (
    <Marker
      coordinate={{ latitude: stop.lat, longitude: stop.lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      zIndex={5}
      title={stop.name}
      description={timeLabel(stop)}>
      <View style={[styles.stop, done && styles.stopDone]}>
        {done ? (
          <Ionicons name="checkmark" size={11} color={colors.white} />
        ) : (
          <Txt style={styles.stopText} color={colors.white}>
            {number}
          </Txt>
        )}
      </View>
    </Marker>
  );
}

/** A pin from Pin spot: 📍 for a spot, 🚗 for a vehicle. Tapping opens its card. */
export function PinMarker({ pin, selected, onPress }: { pin: Pin; selected: boolean; onPress: () => void }) {
  const spot = pin.type === 'spot';
  const tracks = useTracks(`${selected}`);
  return (
    <Marker
      coordinate={at(pin)}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      zIndex={selected ? 25 : 10}
      onPress={(e) => {
        e.stopPropagation?.();
        onPress();
      }}
      accessibilityLabel={`${spot ? 'Pinned spot' : 'Vehicle'}: ${pinTitle(pin)}`}>
      <View style={[styles.pin, { borderColor: selected ? colors.teal : spot ? colors.red : colors.blue }]}>
        <Txt style={{ fontSize: 15, lineHeight: 19 }}>{spot ? '📍' : '🚗'}</Txt>
      </View>
    </Marker>
  );
}

/** Dashed amber line from a far member to the group, with "900 m" in the middle. */
export function FarLine({ far, centre }: { far: FarMember; centre: LatLng }) {
  const mid = { lat: (far.member.lat + centre.lat) / 2, lng: (far.member.lng + centre.lng) / 2 };
  const text = distanceText(far.distanceM);
  const tracks = useTracks(text);
  return (
    <>
      <Polyline
        coordinates={[at(far.member), at(centre)]}
        strokeColor={colors.amber}
        strokeWidth={3}
        lineDashPattern={[8, 8]}
        zIndex={4}
      />
      <Marker coordinate={at(mid)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracks} zIndex={15} tappable={false}>
        <View style={styles.distance}>
          <Txt style={styles.distanceText} color={colors.amberText}>
            {text}
          </Txt>
        </View>
      </Marker>
    </>
  );
}

const pillShadow = {
  shadowColor: colors.navy,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 3,
  elevation: 3,
} as const;

const styles = StyleSheet.create({
  member: { alignItems: 'center', gap: LABEL_GAP },
  ring: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...pillShadow,
  },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 15 },
  label: {
    minHeight: LINE,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: { fontFamily: fontFamily.bold, fontSize: 10, lineHeight: 14 },
  seenText: { fontFamily: fontFamily.semibold, fontSize: 9, lineHeight: 12, marginBottom: 1 },
  stop: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.navy,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopDone: { backgroundColor: colors.disabled },
  stopText: { fontFamily: fontFamily.bold, fontSize: 10, lineHeight: 13 },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...pillShadow,
  },
  distance: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 9, backgroundColor: colors.white, ...pillShadow },
  distanceText: { fontFamily: fontFamily.bold, fontSize: 10, lineHeight: 14 },
});
