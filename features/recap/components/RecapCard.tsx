import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Avatars } from '@/components/ui/Avatars';
import { WEATHER_ICONS } from '@/features/today/components/WeatherLine';
import { colors, fontFamily } from '@/lib/theme';
import { CARD_H, CARD_W, cardLayout, TAG_FONT, TAG_ICON_W, TAG_LINE_H, TRAIL_PATH, TRAIL_X } from '../cardLayout';
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
 * Day recap story card (prototype screen 15): the prototype's glowing trail (the same line for
 * every trip, react-native-svg, no map tiles) with the day's visited stops along it in visit
 * order, an emoji marker and full-name pill each, "Start · 08:30" / "End · 20:00" tags at the first
 * and last stop (cardLayout.ts), the real km / stops / hours out / weather, the trip and date,
 * the group and the TripTrail mark.
 * The ref is the view captured for Share / Download (square corners, 9:16).
 */
export const RecapCard = forwardRef<View, RecapCardProps>(function RecapCard({ recap, width }, ref) {
  const s = width / CARD_W;
  const px = (n: number) => n * s;
  // Worked out again only when the stops or the start / end times change (not on every clock tick).
  const key = [...recap.stops.map((p) => `${p.id}:${p.name}:${p.category}`), recap.ends.start, recap.ends.end].join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => cardLayout(recap.stops, recap.ends), [key]);
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
          <LinearGradient id="trail" gradientUnits="userSpaceOnUse" x1={TRAIL_X.from} y1={0} x2={TRAIL_X.to} y2={0}>
            <Stop offset="0" stopColor={MINT} />
            <Stop offset="1" stopColor={GOLD} />
          </LinearGradient>
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
        {/* The prototype's trail: 6 px, mint → gold, with its soft glow (wide faint copies underneath). */}
        <G fill="none" strokeLinecap="round" stroke="url(#trail)">
          <Path d={TRAIL_PATH} strokeWidth={18} strokeOpacity={0.12} />
          <Path d={TRAIL_PATH} strokeWidth={12} strokeOpacity={0.25} />
          <Path d={TRAIL_PATH} strokeWidth={6} />
        </G>
        {/* Thin lines from a marker to its name when the name sits away from it. */}
        <G stroke={colors.white} strokeOpacity={0.7} strokeWidth={1}>
          {layout.labels.map((l) => (l.leader ? <Path key={`leader-${l.id}`} d={`M${l.leader.x1} ${l.leader.y1} L${l.leader.x2} ${l.leader.y2}`} /> : null))}
          {layout.tags.map((t) => (t.leader ? <Path key={`tag-leader-${t.kind}`} d={`M${t.leader.x1} ${t.leader.y1} L${t.leader.x2} ${t.leader.y2}`} strokeDasharray="2 2" /> : null))}
        </G>
        {layout.markers.map((m) => (
          <Circle key={m.id} cx={m.x} cy={m.y} r={m.r} fill={colors.white} />
        ))}
      </Svg>

      {layout.markers.map((m) => (
        <Text
          key={m.id}
          style={[styles.emoji, { left: px(m.x - m.r), top: px(m.y - m.r), width: px(m.r * 2), fontSize: px(m.r), lineHeight: px(m.r * 2) }]}>
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

      {layout.tags.map((t) => (
        <View
          key={t.kind}
          testID={`recap-tag-${t.kind}`}
          style={[styles.tag, { left: px(t.x), top: px(t.y), width: px(t.w), height: px(t.h), borderRadius: px(t.h / 2), paddingLeft: px(5) }]}>
          <View style={{ width: px(TAG_ICON_W - 2), alignItems: 'center' }}>
            {t.kind === 'end' ? (
              <Ionicons name="flag" size={px(7.5)} color={GOLD} />
            ) : (
              <View style={{ width: px(5), height: px(5), borderRadius: px(2.5), backgroundColor: MINT }} />
            )}
          </View>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tagText, { fontSize: px(TAG_FONT), lineHeight: px(TAG_LINE_H) }]}>
            {t.text}
          </Text>
        </View>
      ))}

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
  label: { position: 'absolute', backgroundColor: 'rgba(20,40,79,0.7)', alignItems: 'center', justifyContent: 'center' },
  labelText: { fontFamily: fontFamily.bold, color: colors.white, textAlign: 'center' },
  tag: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,110,106,0.85)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(143,224,210,0.6)',
  },
  tagText: { fontFamily: fontFamily.semibold, color: colors.white },
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
