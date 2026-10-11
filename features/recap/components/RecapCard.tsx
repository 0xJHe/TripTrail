import Ionicons from '@expo/vector-icons/Ionicons';
import { Fragment, forwardRef, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Avatars } from '@/components/ui/Avatars';
import { WEATHER_ICONS } from '@/features/today/components/WeatherLine';
import { colors, fontFamily } from '@/lib/theme';
import type { DayRecap } from '../hooks/useDayRecap';
import { curvePath, hoursText, kmText, labelWidth, placeLabels, projector, simplify, stopEmoji } from '../trail';

/** The card is drawn on a 300-wide, 9:16 canvas and scaled to `width`. */
const W = 300;
const H = (W * 16) / 9;
/** Where the trail goes: under the title, above the stats. */
const TRAIL_BOX = { x: 34, y: 140, w: 232, h: 240 };
const MARKER_R = 13;
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
 * on a dark background (react-native-svg, no map tiles), an emoji marker per visited stop,
 * km / stops / hours out / weather, the trip, day and date, the group and the TripTrail mark.
 * The ref is the view captured for Share / Download (square corners, 9:16).
 */
export const RecapCard = forwardRef<View, RecapCardProps>(function RecapCard({ recap, width }, ref) {
  const s = width / W;
  const draw = useMemo(() => {
    const project = projector([...recap.trail, ...recap.stops], TRAIL_BOX);
    const line = simplify(recap.trail.map(project), 1.2);
    const markers = recap.stops.map((p) => ({ ...project(p), name: p.name, emoji: stopEmoji(p), id: p.id }));
    return { line, path: curvePath(line), markers, labels: placeLabels(markers) };
  }, [recap.trail, recap.stops]);
  const first = draw.line[0];
  const last = draw.line[draw.line.length - 1];
  const sameEnds = !first || !last || Math.hypot(last.x - first.x, last.y - first.y) < 1;
  const w = recap.weather;
  const px = (n: number) => n * s;

  return (
    <View ref={ref} collapsable={false} style={{ width, height: width * (16 / 9), backgroundColor: colors.navy }} testID="recap-card">
      <Svg width={width} height={width * (16 / 9)} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="bg" x1="0.2" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor={colors.navy} />
            <Stop offset="0.5" stopColor={colors.navyMid} />
            <Stop offset="1" stopColor={colors.navyTeal} />
          </LinearGradient>
          <LinearGradient
            id="trail"
            gradientUnits="userSpaceOnUse"
            x1={first?.x ?? 0}
            y1={first?.y ?? 0}
            x2={sameEnds ? (first?.x ?? 0) + 1 : last.x}
            y2={sameEnds ? (first?.y ?? 0) : last.y}>
            <Stop offset="0" stopColor={MINT} />
            <Stop offset="1" stopColor={GOLD} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#bg)" />
        {/* Faint streets, for the feel of a map. */}
        <G stroke="#FFFFFF" strokeOpacity={0.08} strokeWidth={6} fill="none">
          <Path d="M0 200 L300 180" />
          <Path d="M0 300 L300 320" />
          <Path d="M0 400 L300 390" />
          <Path d="M90 120 L100 480" />
          <Path d="M200 120 L190 480" />
        </G>
        {draw.path ? (
          // Glow: the same line, wide and faint underneath.
          <G fill="none" strokeLinecap="round" strokeLinejoin="round" stroke="url(#trail)">
            <Path d={draw.path} strokeWidth={18} strokeOpacity={0.1} />
            <Path d={draw.path} strokeWidth={11} strokeOpacity={0.22} />
            <Path d={draw.path} strokeWidth={5.5} />
          </G>
        ) : null}
        {draw.markers.map((m) => (
          <Circle key={m.id} cx={m.x} cy={m.y} r={MARKER_R} fill={colors.white} />
        ))}
      </Svg>

      {draw.markers.map((m, i) => (
        <Fragment key={m.id}>
          <Text
            style={[styles.emoji, { left: px(m.x - MARKER_R), top: px(m.y - MARKER_R), width: px(MARKER_R * 2), height: px(MARKER_R * 2), fontSize: px(13), lineHeight: px(MARKER_R * 2) }]}>
            {m.emoji}
          </Text>
          <View
            style={[
              styles.label,
              { left: px(draw.labels[i].x - labelWidth(m.name) / 2), top: px(draw.labels[i].y - 8), width: px(labelWidth(m.name)), height: px(16), borderRadius: px(8) },
            ]}>
            <Text numberOfLines={1} style={[styles.labelText, { fontSize: px(9.5), lineHeight: px(12) }]}>
              {m.name}
            </Text>
          </View>
        </Fragment>
      ))}

      {!recap.hasPositions ? (
        <View style={[styles.noRoute, { top: px(TRAIL_BOX.y + TRAIL_BOX.h / 2 - 10), paddingHorizontal: px(30) }]}>
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
        {recap.route ? (
          <Text numberOfLines={1} style={[styles.meta, { fontSize: px(13), lineHeight: px(17), marginTop: px(2) }]}>
            {recap.route}
          </Text>
        ) : null}
      </View>

      <View style={[styles.stats, { left: px(20), right: px(16), bottom: px(64), gap: px(10) }]}>
        <Stat value={recap.hasPositions ? kmText(recap.meters) : '–'} label="km travelled" s={s} />
        <Stat value={String(recap.stops.length)} label={recap.stops.length === 1 ? 'stop' : 'stops'} s={s} />
        <Stat value={recap.hasPositions ? hoursText(recap.outMs) : '–'} label="out" s={s} />
        {w ? (
          <Stat
            value={`${w.tempC}°`}
            label={w.words}
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

function Stat({ value, label, s, icon }: { value: string; label: string; s: number; icon?: ReactNode }) {
  return (
    <View style={{ flexShrink: 1 }}>
      <View style={[styles.statRow, { gap: 5 * s }]}>
        {icon}
        <Text style={[styles.statValue, { fontSize: 24 * s, lineHeight: 28 * s }]}>{value}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.meta, { fontSize: 10 * s, lineHeight: 13 * s, marginTop: 2 * s }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emoji: { position: 'absolute', textAlign: 'center', color: colors.text },
  label: { position: 'absolute', backgroundColor: 'rgba(20,40,79,0.7)', alignItems: 'center', justifyContent: 'center' },
  labelText: { fontFamily: fontFamily.bold, color: colors.white, paddingHorizontal: 4 },
  noRoute: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  date: { fontFamily: fontFamily.bold, color: MINT, letterSpacing: 0.5 },
  title: { fontFamily: fontFamily.extrabold, color: colors.white, letterSpacing: -0.6 },
  meta: { fontFamily: fontFamily.regular, color: META },
  stats: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between' },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  statValue: { fontFamily: fontFamily.extrabold, color: colors.white },
  foot: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  mark: { backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontFamily: fontFamily.bold, color: colors.white },
});
