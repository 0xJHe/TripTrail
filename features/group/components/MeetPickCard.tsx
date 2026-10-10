import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Txt } from '@/components/ui/Txt';
import type { LatLng } from '@/lib/distance';
import { colors } from '@/lib/theme';
import { SPOT_NAME } from '../meetPoint';

export interface MeetSpot extends LatLng {
  /** Stop or pin name; null for a spot tapped on the map. */
  name: string | null;
  /** Stop or pin id when picked from the list. */
  key: string | null;
}

interface MeetPickCardProps {
  draft: MeetSpot | null;
  /** Today's stops and pins to pick from. */
  options: (MeetSpot & { key: string; name: string })[];
  onPick: (spot: MeetSpot) => void;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

/** Picking the meet point: tap the map, or one of today's stops or pins, then confirm. */
export function MeetPickCard({ draft, options, onPick, onConfirm, onCancel, saving, error }: MeetPickCardProps) {
  return (
    <Card style={styles.card} testID="meet-pick">
      <View style={styles.head}>
        <View style={styles.ico}>
          <Ionicons name="flag" size={14} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="h14">{draft ? `Meet at ${draft.name ?? SPOT_NAME}?` : 'Where should everyone meet?'}</Txt>
          <Txt variant="s11">Tap the map, or pick one of today's stops or pins</Txt>
        </View>
      </View>
      {options.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {options.map((o) => (
            <Chip key={o.key} label={o.name} size="sm" selected={draft?.key === o.key} onPress={() => onPick(o)} />
          ))}
        </ScrollView>
      ) : null}
      {error ? (
        <Txt variant="b12" color={colors.red}>
          {error}
        </Txt>
      ) : null}
      <View style={styles.row}>
        <Button label="Set meet point" size="sm" onPress={onConfirm} disabled={!draft} loading={saving} style={styles.half} />
        <Button label="Cancel" size="sm" variant="secondary" onPress={onCancel} style={styles.half} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ico: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: 6, paddingRight: 4 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});
