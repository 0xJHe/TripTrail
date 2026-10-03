import { StyleSheet, View } from 'react-native';

import { colors, fontFamily } from '@/lib/theme';
import { Txt } from './Txt';

export interface AvatarItem {
  key: string;
  name: string;
  color: string;
  /** Greyed out, e.g. hasn't answered yet. */
  muted?: boolean;
}

interface AvatarsProps {
  people: AvatarItem[];
  size?: number;
  /** Show a dashed "+" bubble at the end. */
  plus?: boolean;
  max?: number;
}

/** Overlapping initials (prototype .avatars). */
export function Avatars({ people, size = 26, plus, max = 6 }: AvatarsProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const bubble = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={styles.row} accessibilityLabel={people.map((p) => p.name).join(', ')}>
      {shown.map((p, i) => (
        <View
          key={p.key}
          style={[
            styles.avatar,
            bubble,
            { backgroundColor: p.muted ? colors.disabled : p.color },
            i > 0 && styles.overlap,
          ]}>
          <Txt style={[styles.initial, { fontSize: size * 0.4, lineHeight: size * 0.5 }]} color={colors.white}>
            {initial(p.name)}
          </Txt>
        </View>
      ))}
      {extra > 0 ? (
        <View style={[styles.avatar, bubble, styles.overlap, { backgroundColor: colors.chip }]}>
          <Txt style={[styles.initial, { fontSize: size * 0.36 }]} color={colors.textMuted}>
            +{extra}
          </Txt>
        </View>
      ) : null}
      {plus ? (
        <View style={[styles.avatar, bubble, shown.length > 0 && styles.overlap, styles.plus]}>
          <Txt style={[styles.initial, { fontSize: size * 0.42 }]} color={colors.textMuted}>
            +
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

export function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: { borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  overlap: { marginLeft: -8 },
  initial: { fontFamily: fontFamily.bold },
  plus: { backgroundColor: colors.chip, borderStyle: 'dashed', borderColor: '#B8BEC8', borderWidth: 1.5 },
});
