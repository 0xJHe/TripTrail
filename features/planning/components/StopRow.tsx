import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily } from '@/lib/theme';
import { priceLabel, timeLabel } from '../stops';
import type { Stop } from '../types';

const BOOKED_ICON = { flight: 'airplane', hotel: 'bed' } as const;

interface StopRowProps {
  stop: Stop;
  onPress: () => void;
}

/** One stop on the day's timeline (prototype .stop). Booked flights and hotels are navy. */
export function StopRow({ stop, onPress }: StopRowProps) {
  const booked = stop.is_booked;
  const accent = booked ? colors.navy : colors.tealDark;
  const time = timeLabel(stop);
  const icon = stop.category === 'flight' || stop.category === 'hotel' ? BOOKED_ICON[stop.category] : null;
  return (
    <View style={styles.stop}>
      <View style={styles.line} />
      <View style={[styles.dot, { borderColor: booked ? colors.navy : colors.teal }]} />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${time} ${stop.name}, ${priceLabel(stop)}${booked ? ', booked' : ''}. Edit`}
        style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.85 }]}>
        <Card style={styles.card}>
          <View style={{ flex: 1 }}>
            <Txt style={styles.time} color={accent}>
              {time || 'No time set'}
            </Txt>
            <Txt variant="h15">{stop.name}</Txt>
            <View style={styles.meta}>
              <Txt variant="s11">{priceLabel(stop)}</Txt>
              {booked ? (
                <View style={styles.booked}>
                  {icon ? <Ionicons name={icon} size={11} color={colors.navy} /> : null}
                  <Txt style={styles.bookedText} color={colors.navy}>
                    Booked
                  </Txt>
                </View>
              ) : null}
            </View>
          </View>
          <Chip label="Edit" size="sm" ghost />
        </Card>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stop: { flexDirection: 'row', gap: 12, paddingBottom: 8 },
  line: { position: 'absolute', left: 6, top: 21, bottom: -14, width: 2, backgroundColor: '#D6DCE5' },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.white,
    borderWidth: 4,
    marginTop: 14,
  },
  card: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 9, paddingHorizontal: 12, gap: 8 },
  time: { fontFamily: fontFamily.bold, fontSize: 11, lineHeight: 14, marginBottom: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  booked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E6EBF3',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  bookedText: { fontFamily: fontFamily.bold, fontSize: 10, lineHeight: 14 },
});
