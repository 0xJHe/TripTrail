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

// Fixed marker boxes: Android draws a custom marker as a picture of its view, and clips
// anything outside the view's own size (the known half-circle bug), so every marker has an
// exact width and height that its content fits inside, with no shadows or overflow.
const AVATAR = 34;
const LABEL_GAP = 3;
const LINE = 16;
const SEEN_LINE = 13;
const MEMBER_W = 100;
const STOP_BOX = 24;
const PIN_BOX = 36;
const DISTANCE_W = 64;
const DISTANCE_H = 22;
const MEET_W = 120;
const MEET_H = 42;

/**
 * Android redraws a custom marker only while tracksViewChanges is on (and that is slow if left
 * on). On until the marker's view has been laid out, plus a frame or two, after every content
 * change (name, battery, colour), then off. A fallback turns it off if layout never fires.
 */
export function useMarkerTracks(key: string): { tracks: boolean; onLayout: () => void } {
  const [tracks, setTracks] = useState(true);
  const [laidOut, setLaidOut] = useState(0);
  useEffect(() => {
    setTracks(true);
    const id = setTimeout(() => setTracks(false), 2000);
    return () => clearTimeout(id);
  }, [key]);
  useEffect(() => {
    if (laidOut === 0) return;
    const id = setTimeout(() => setTracks(false), 250);
    return () => clearTimeout(id);
  }, [laidOut, key]);
  return { tracks, onLayout: () => setLaidOut((n) => n + 1) };
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
  const { tracks, onLayout } = useMarkerTracks(`${tone}|${label}|${seen}`);
  const height = AVATAR + LABEL_GAP + LINE + (seen ? SEEN_LINE : 0);
  return (
    <Marker
      coordinate={at(member)}
      anchor={{ x: 0.5, y: AVATAR / 2 / height }}
      tracksViewChanges={tracks}
      zIndex={member.isMe ? 30 : 20}
      title={member.isMe ? 'You' : member.name}
      description={[member.battery != null ? `Battery ${member.battery}%` : null, seen].filter(Boolean).join(' · ') || undefined}
      accessibilityLabel={[label, seen].filter(Boolean).join(', ')}>
      <View style={[styles.member, { height }]} collapsable={false} onLayout={onLayout}>
        <View style={styles.ring}>
          <View style={[styles.avatar, { backgroundColor: TONE[tone] }]}>
            <Txt style={styles.initial} color={colors.white}>
              {(member.isMe ? 'You' : firstName(member.name)).charAt(0).toUpperCase()}
            </Txt>
          </View>
        </View>
        <View style={[styles.label, { height: LINE + (seen ? SEEN_LINE : 0) }]}>
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
export function StopMarker({ stop, number, onPress }: { stop: Stop; number: number; onPress?: () => void }) {
  const done = stop.status === 'done';
  const { tracks, onLayout } = useMarkerTracks(`${stop.status}|${number}`);
  if (stop.lat == null || stop.lng == null) return null;
  return (
    <Marker
      coordinate={{ latitude: stop.lat, longitude: stop.lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      zIndex={5}
      title={onPress ? undefined : stop.name}
      description={onPress ? undefined : timeLabel(stop)}
      onPress={
        onPress
          ? (e) => {
              e.stopPropagation?.();
              onPress();
            }
          : undefined
      }>
      <View style={styles.stopBox} collapsable={false} onLayout={onLayout}>
        <View style={[styles.stop, done && styles.stopDone]}>
          {done ? (
            <Ionicons name="checkmark" size={11} color={colors.white} />
          ) : (
            <Txt style={styles.stopText} color={colors.white}>
              {number}
            </Txt>
          )}
        </View>
      </View>
    </Marker>
  );
}

/** A pin from Pin spot: 📍 for a spot, 🚗 for a vehicle. Tapping opens its card. */
export function PinMarker({
  pin,
  selected,
  onPress,
  showName = false,
}: {
  pin: Pin;
  selected: boolean;
  onPress?: () => void;
  /** Its name under the circle (the small map on Pin spot). */
  showName?: boolean;
}) {
  const spot = pin.type === 'spot';
  const title = pinTitle(pin);
  const { tracks, onLayout } = useMarkerTracks(`${selected}|${pin.type}|${showName ? title : ''}`);
  const height = PIN_BOX + (showName ? LINE : 0);
  return (
    <Marker
      coordinate={at(pin)}
      anchor={{ x: 0.5, y: PIN_BOX / 2 / height }}
      tracksViewChanges={tracks}
      zIndex={selected ? 25 : 10}
      tappable={!!onPress}
      onPress={
        onPress
          ? (e) => {
              e.stopPropagation?.();
              onPress();
            }
          : undefined
      }
      accessibilityLabel={`${spot ? 'Pinned spot' : 'Vehicle'}: ${title}`}>
      <View style={[styles.pinBox, showName && styles.pinNamed]} collapsable={false} onLayout={onLayout}>
        <View style={[styles.pin, { borderColor: selected ? colors.teal : spot ? colors.red : colors.blue }]}>
          <Txt style={styles.pinEmoji}>{spot ? '📍' : '🚗'}</Txt>
        </View>
        {showName ? (
          <View style={[styles.label, { height: LINE }]}>
            <Txt style={styles.labelText} numberOfLines={1}>
              {title}
            </Txt>
          </View>
        ) : null}
      </View>
    </Marker>
  );
}

/** Dashed amber line from a far member to the group, with "900 m" in the middle. */
export function FarLine({ far, centre }: { far: FarMember; centre: LatLng }) {
  const mid = { lat: (far.member.lat + centre.lat) / 2, lng: (far.member.lng + centre.lng) / 2 };
  const text = distanceText(far.distanceM);
  const { tracks, onLayout } = useMarkerTracks(text);
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
        <View style={styles.distanceBox} collapsable={false} onLayout={onLayout}>
          <View style={styles.distance}>
            <Txt style={styles.distanceText} color={colors.amberText} numberOfLines={1}>
              {text}
            </Txt>
          </View>
        </View>
      </Marker>
    </>
  );
}


/**
 * The meet point (or a split's rejoin point): a navy "Meet point" tag with a stem down to the
 * spot. `draft` while it's being picked (dashed, not saved yet).
 */
export function MeetMarker({ point, label, draft = false }: { point: LatLng; label: string; draft?: boolean }) {
  const { tracks, onLayout } = useMarkerTracks(`${label}|${draft}`);
  return (
    <Marker
      coordinate={at(point)}
      anchor={{ x: 0.5, y: (MEET_H - 4) / MEET_H }}
      tracksViewChanges={tracks}
      zIndex={40}
      tappable={false}
      accessibilityLabel={label}>
      <View style={styles.meetBox} collapsable={false} onLayout={onLayout}>
        <View style={[styles.meetTag, draft && styles.meetDraft]}>
          <Ionicons name="flag" size={11} color={draft ? colors.navy : colors.white} />
          <Txt style={styles.meetText} color={draft ? colors.navy : colors.white} numberOfLines={1}>
            {label}
          </Txt>
        </View>
        <View style={[styles.meetStem, draft && { backgroundColor: colors.navy }]} />
        <View style={styles.meetDot} />
      </View>
    </Marker>
  );
}

// No shadows inside markers (Android clips them and they can stop the picture redrawing):
// thin borders give the same lift.
const styles = StyleSheet.create({
  member: { width: MEMBER_W, alignItems: 'center', gap: LABEL_GAP, overflow: 'hidden' },
  ring: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 15 },
  label: {
    maxWidth: MEMBER_W,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: { fontFamily: fontFamily.bold, fontSize: 10, lineHeight: 14 },
  seenText: { fontFamily: fontFamily.semibold, fontSize: 9, lineHeight: 12 },
  stopBox: { width: STOP_BOX, height: STOP_BOX, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
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
  pinBox: { width: PIN_BOX, height: PIN_BOX, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinNamed: { width: MEMBER_W, height: PIN_BOX + LINE, justifyContent: 'flex-start' },
  pinEmoji: { fontSize: 15, lineHeight: 19 },
  distanceBox: {
    width: DISTANCE_W,
    height: DISTANCE_H,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  distance: {
    height: 18,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  distanceText: { fontFamily: fontFamily.bold, fontSize: 10, lineHeight: 14 },
  meetBox: { width: MEET_W, height: MEET_H, alignItems: 'center', overflow: 'hidden' },
  meetTag: {
    height: 24,
    maxWidth: MEET_W,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: colors.navy,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  meetDraft: { backgroundColor: colors.white, borderColor: colors.navy, borderStyle: 'dashed' },
  meetText: { fontFamily: fontFamily.bold, fontSize: 11, lineHeight: 14 },
  meetStem: { width: 2, height: 10, backgroundColor: colors.navy },
  meetDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.navy, borderWidth: 1.5, borderColor: colors.white },
});
