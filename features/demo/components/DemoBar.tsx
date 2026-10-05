import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { advanceFakeTime, resetFakeTime, setFakeTime, useNow } from '@/lib/clock';
import { centroid, haversineMeters } from '@/lib/distance';
import { eventsAround, useGroupLocation, type DemoEvent, type DemoEventKind, type GroupLocation } from '@/lib/location';
import { colors, fontFamily } from '@/lib/theme';
import { useDemoReplay } from '../hooks/useDemoReplay';

type IconName = ComponentProps<typeof Ionicons>['name'];

const EVENT_ICON: Record<DemoEventKind, { icon: IconName; color: string }> = {
  start: { icon: 'flag', color: colors.white },
  arrive: { icon: 'location', color: colors.teal },
  leave: { icon: 'walk', color: colors.textOnNavy },
  late: { icon: 'alert-circle', color: colors.red },
  early: { icon: 'checkmark-circle', color: colors.green },
  rain: { icon: 'rainy', color: colors.blue },
  far: { icon: 'battery-dead', color: colors.amber },
  rejoin: { icon: 'people', color: colors.teal },
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const timeText = (d: Date) => `${DAYS[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Demo mode debug bar: fake time, what just happened, and buttons to move the clock. */
export function DemoBar({ topInset }: { topInset: number }) {
  const { route, tripId } = useDemoReplay();
  const time = useNow();
  const loc = useGroupLocation();
  const [open, setOpen] = useState(false);
  const { last, next } = route ? eventsAround(route, time.getTime()) : { last: null, next: null };
  const nextAt = next?.at ?? route?.nextDayStartsAt ?? null;

  let status = 'Open a trip to replay its day.';
  if (tripId && !route) status = 'Add stops with a time and a place to the Day plan to replay a route.';

  return (
    <View style={[styles.bar, { paddingTop: topInset + 6 }]} testID="demo-bar">
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.row} accessibilityRole="button" accessibilityLabel="Show demo details">
        <View style={styles.pill}>
          <Txt style={styles.pillText} color={colors.navy}>
            DEMO
          </Txt>
        </View>
        <Txt variant="h14" color={colors.white} style={{ flex: 1 }}>
          {route ? `Day ${route.day} · ` : ''}
          {timeText(time)}
        </Txt>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textOnNavy} />
      </Pressable>

      {route ? (
        <>
          <EventLine event={last} prefix="Now" />
          <EventLine event={next} prefix="Next" muted />
        </>
      ) : (
        <Txt variant="s11" color={colors.textOnNavy}>
          {status}
        </Txt>
      )}
      {open && loc ? <Members loc={loc} /> : null}

      <View style={styles.row}>
        <BarButton label="+15 min" onPress={() => advanceFakeTime(15)} />
        <BarButton
          label={next || nextAt == null ? 'Next event' : 'Next day'}
          onPress={() => nextAt != null && setFakeTime(nextAt)}
          disabled={nextAt == null}
        />
        <BarButton label="Reset" onPress={resetFakeTime} />
      </View>
    </View>
  );
}

function EventLine({ event, prefix, muted }: { event: DemoEvent | null; prefix: string; muted?: boolean }) {
  if (!event) return null;
  const { icon, color } = EVENT_ICON[event.kind];
  const at = new Date(event.at);
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={14} color={muted ? colors.textOnNavy : color} />
      <Txt variant="b12" color={muted ? colors.textOnNavy : colors.white} style={{ flex: 1 }} numberOfLines={1}>
        {prefix}: {event.title}
        {muted ? ` · ${pad(at.getHours())}:${pad(at.getMinutes())}` : ''}
      </Txt>
    </View>
  );
}

/** Each member's distance from the rest of the group and battery, plus rain. */
function Members({ loc }: { loc: GroupLocation }) {
  return (
    <View style={styles.members}>
      {loc.members.map((m) => {
        const rest = centroid(loc.members.filter((o) => o.id !== m.id)) ?? m;
        const away = Math.round(haversineMeters(m, rest));
        const warn = away > 500 || (m.battery != null && m.battery < 15);
        return (
          <View key={m.id} style={styles.row}>
            <Ionicons name={warn ? 'warning' : 'person'} size={12} color={warn ? colors.amber : colors.textOnNavy} />
            <Txt variant="s11" color={warn ? colors.amber : colors.textOnNavy}>
              {m.isMe ? 'You' : m.name} · {away} m from the rest · {m.battery ?? '?'}% battery
            </Txt>
          </View>
        );
      })}
      {loc.rainSoon ? (
        <View style={styles.row}>
          <Ionicons name="rainy" size={12} color={colors.blue} />
          <Txt variant="s11" color={colors.blue}>
            Rain here within the hour
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

function BarButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, (pressed || disabled) && { opacity: 0.5 }]}>
      <Txt style={styles.buttonText} color={colors.white}>
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.text, paddingHorizontal: 12, paddingBottom: 8, gap: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { backgroundColor: colors.amber, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  pillText: { fontFamily: fontFamily.extrabold, fontSize: 11, lineHeight: 15 },
  members: { gap: 3, paddingVertical: 2 },
  button: {
    flex: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  buttonText: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 15 },
});
