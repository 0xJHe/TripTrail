import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Avatars } from '@/components/ui/Avatars';
import { WEATHER_ICONS } from '@/features/today/components/WeatherLine';
import { colors, fontFamily } from '@/lib/theme';
import { CARD_H, CARD_W, cardLayout, MARKER_R } from '../cardLayout';
import type { DayRecap } from '../hooks/useDayRecap';
import { hoursText, kmText } from '../trail';

const MINT = '#8FE0D2';
const GOLD = '#F0A01E';
const META = '#C9D8EE';
const SUN = '#FFD86B';

interface RecapCardProps {
  recap: DayRecap;
  width: number;
}

/**
 * Day recap story card (prototype screen 15): the route this person walked as a glowing line
 * on a dark background (react-native-svg, no map tiles), an emoji marker per visited stop with
 * its full name (moved into free space with a thin line when stops are close; cardLayout.ts),
 * km / stops / hours out / weather, the trip and date, the group and the TripTrail mark.
 * The ref is the view captured for Share / Download (square corners, 9:16).
 */
export const RecapCard = forwardRef<View, RecapCardProps>(function RecapCard({ recap, width }, ref) {
  const s = width / CARD_W;
  const px = (n: number) => n * s;
  // Worked out again only when the trail, the stops or the name change (not on every clock tick).
  const last = recap.trail[recap.trail.length - 1];
  const key = [recap.trail.length, last?.at, last?.lat, last?.lng, ...recap.stops.map((p) => `${p.id}@${p.lat},${p.lng}`), recap.trip?.name].join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => cardLayout(recap.trail, recap.stops, recap.trip?.name ?? ''), [key]);
  const ends = layout.ends;
  const w = recap.weather;

  return (
    <View ref={ref} collapsable={false} style={{ width, height: px(CARD_H), backgroundColor: colors.navy }} testID="recap-card">
      <Svg width={width} height={px(CARD_H)} viewBox={`0 0 ${CARD_W} ${CARD_H}`} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="bg" x1="0.2" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor={colors.navy} />
            <Stop offset="0.5" stopColor={colors.navyMid} />
            <Stop offset="1" stopColor={colors.navyTeal} />
          </LinearGradient>
          {ends ? (
            <LinearGradient
              id="trail"
              gradientUnits="userSpaceOnUse"
              x1={ends.from.x}
              y1={ends.from.y}
              x2={Math.hypot(ends.to.x - ends.from.x, ends.to.y - ends.from.y) < 1 ? ends.from.x + 1 : ends.to.x}
              y2={ends.to.y}>
              <Stop offset="0" stopColor={MINT} />
              <Stop offset="1" stopColor={GOLD} />
            </LinearGradient>
          ) : null}
        </Defs>
        <Rect x={0} y={0} width={CARD_W} height={CARD_H} fill="url(#bg)" />
        {/* Faint streets, for the feel of a map. */}
        <G stroke="#FFFFFF" strokeOpacity={0.08} strokeWidth={6} fill="none">
          <Path d="M0 200 L300 180" />
          <Path d="M0 300 L300 320" />
          <Path d="M0 400 L300 390" />
          <Path d="M90 120 L100 480" />
          <Path d="M200 120 L190 480" />
        </G>
        {layout.path ? (
          // Glow: the same line, wide and faint underneath.
          <G fill="none" strokeLinecap="round" strokeLinejoin="round" stroke="url(#trail)">
            <Path d={layout.path} strokeWidth={18} strokeOpacity={0.1} />
            <Path d={layout.path} strokeWidth={11} strokeOpacity={0.22} />
            <Path d={layout.path} strokeWidth={5.5} />
          </G>
        ) : null}
        {layout.markers.map((m) =>
          m.spot ? (
            <G key={`spot-${m.id}`}>
              <Path d={`M${m.spot.x} ${m.spot.y} L${m.x} ${m.y}`} stroke={colors.white} strokeOpacity={0.55} strokeWidth={1.2} />
              <Circle cx={m.spot.x} cy={m.spot.y} r={2.6} fill={colors.white} />
            </G>
          ) : null,
        )}
        {/* Thin lines from a marker to its name when the name sits away from it. */}
        <G stroke={colors.white} strokeOpacity={0.7} strokeWidth={1}>
          {layout.labels.map((l) => (l.leader ? <Path key={`leader-${l.id}`} d={`M${l.leader.x1} ${l.leader.y1} L${l.leader.x2} ${l.leader.y2}`} /> : null))}
        </G>
        {layout.markers.map((m) => (
          <Circle key={m.id} cx={m.x} cy={m.y} r={MARKER_R} fill={colors.white} />
        ))}
      </Svg>

      {layout.markers.map((m) => (
        <Text
          key={m.id}
          style={[styles.emoji, { left: px(m.x - MARKER_R), top: px(m.y - MARKER_R), width: px(MARKER_R * 2), fontSize: px(13), lineHeight: px(MARKER_R * 2) }]}>
          {m.emoji}
        </Text>
      ))}

      {layout.labels.map((l) => (
        <View
          key={l.id}
          style={[styles.label, { left: px(l.x), top: px(l.y), width: px(l.w), height: px(l.h), borderRadius: px(Math.min(l.h / 2, 8)) }]}>
          <Text
            numberOfLines={l.lines.length}
            adjustsFontSizeToFit
            style={[styles.labelText, { fontSize: px(l.fontSize), lineHeight: px(l.lineHeight) }]}>
            {l.lines.join('\n')}
          </Text>
        </View>
      ))}

      {!recap.hasPositions ? (
        <View style={[styles.noRoute, { top: px(layout.mapBox.y + layout.mapBox.h / 2 - 10), paddingHorizontal: px(30) }]}>
          <Text style={[styles.meta, { fontSize: px(11), lineHeight: px(15), textAlign: 'center' }]}>
            No route saved for this day: location sharing was off.
          </Text>
        </View>
      ) : null}

      <View style={{ position: 'absolute', left: px(20), right: px(20), top: px(22) }}>
        <Text style={[styles.date, { fontSize: px(11), lineHeight: px(14) }]}>{recap.dateLine}</Text>
        <Text numberOfLines={2} adjustsFontSizeToFit style={[styles.title, { fontSize: px(30), lineHeight: px(33), marginTop: px(4) }]}>
          {recap.trip?.name ?? ''}
        </Text>
      </View>

      <View style={[styles.stats, { left: px(20), right: px(16), bottom: px(64), gap: px(10) }]}>
        <Stat value={recap.hasPositions ? kmText(recap.meters) : '–'} label="km travelled" s={s} />
        <Stat value={String(recap.stops.length)} label={recap.stops.length === 1 ? 'stop' : 'stops'} s={s} />
        <Stat value={recap.hasPositions ? hoursText(recap.outMs) : '–'} label="out" s={s} />
        {w ? (
          <Stat
            value={`${w.tempC}°`}
            label={w.words}
            lines={2}
            s={s}
            icon={<Ionicons name={WEATHER_ICONS[w.kind]} size={px(20)} color={w.kind === 'sunny' || w.kind === 'partly' ? SUN : META} />}
          />
        ) : null}
      </View>

      <View style={[styles.foot, { left: px(20), right: px(20), bottom: px(20) }]}>
        <Avatars people={recap.people} size={px(26)} max={5} />
        <View style={[styles.brand, { gap: px(6) }]}>
          <View style={[styles.mark, { width: px(20), height: px(20), borderRadius: px(6) }]}>
            <Svg width={px(13)} height={px(13)} viewBox="0 0 24 24" fill="none">
              <Path d="M4 18c3-6 6-6 8-2s5 4 8-4" stroke={colors.white} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <Text style={[styles.brandText, { fontSize: px(12), lineHeight: px(15) }]}>TripTrail</Text>
        </View>
      </View>
    </View>
  );
});

function Stat({ value, label, s, icon, lines = 1 }: { value: string; label: string; s: number; icon?: ReactNode; lines?: number }) {
  return (
    <View style={{ flexShrink: 1, maxWidth: lines > 1 ? 92 * s : undefined }}>
      <View style={[styles.statRow, { gap: 5 * s }]}>
        {icon}
        <Text style={[styles.statValue, { fontSize: 24 * s, lineHeight: 28 * s }]}>{value}</Text>
      </View>
      <Text numberOfLines={lines} style={[styles.meta, { fontSize: 10 * s, lineHeight: 13 * s, marginTop: 2 * s }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emoji: { position: 'absolute', textAlign: 'center', color: colors.text },
  label: { position: 'absolute', backgroundColor: 'rgba(20,40,79,0.78)', alignItems: 'center', justifyContent: 'center' },
  labelText: { fontFamily: fontFamily.bold, color: colors.white, textAlign: 'center' },
  noRoute: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  date: { fontFamily: fontFamily.bold, color: MINT, letterSpacing: 0.5 },
  title: { fontFamily: fontFamily.extrabold, color: colors.white, letterSpacing: -0.6 },
  meta: { fontFamily: fontFamily.regular, color: META },
  stats: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  statValue: { fontFamily: fontFamily.extrabold, color: colors.white },
  foot: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  mark: { backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontFamily: fontFamily.bold, color: colors.white },
});
