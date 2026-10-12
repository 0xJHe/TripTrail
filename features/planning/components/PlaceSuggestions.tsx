import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { LimitNote } from '@/components/ui/LimitNote';
import { Txt } from '@/components/ui/Txt';
import { colors, radius, shadow } from '@/lib/theme';
import type { PlaceSuggestion } from '../api';

interface PlaceSuggestionsProps {
  suggestions: PlaceSuggestion[];
  searching: boolean;
  limited: boolean;
  failed: boolean;
  onPick: (s: PlaceSuggestion) => void;
}

/** Real places matching the typed name, under the Name field. */
export function PlaceSuggestions({ suggestions, searching, limited, failed, onPick }: PlaceSuggestionsProps) {
  if (limited) {
    return (
      <View style={styles.limited}>
        <LimitNote what="Place search paused" />
        <Txt variant="s11" style={styles.typeName}>
          You can still type the name.
        </Txt>
      </View>
    );
  }
  if (failed) {
    return (
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={14} color={colors.amberText} />
        <Txt variant="s11" color={colors.amberText} style={{ flex: 1 }}>
          Couldn't search places right now. You can still type the name.
        </Txt>
      </View>
    );
  }
  if (!suggestions.length) return searching ? <ActivityIndicator color={colors.teal} style={{ alignSelf: 'flex-start' }} /> : null;
  return (
    <View style={styles.list} accessibilityLabel="Places found">
      {suggestions.map((s, i) => (
        <Pressable
          key={s.placeId}
          onPress={() => onPick(s)}
          accessibilityRole="button"
          accessibilityLabel={`${s.name}, ${s.detail}`}
          style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { backgroundColor: colors.tealTint }]}>
          <Ionicons name="location-outline" size={18} color={colors.tealDark} />
          <View style={{ flex: 1 }}>
            <Txt variant="h14" numberOfLines={1}>
              {s.name}
            </Txt>
            {s.detail ? (
              <Txt variant="s11" numberOfLines={1}>
                {s.detail}
              </Txt>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.card, borderRadius: radius.field, overflow: 'hidden', ...shadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  note: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  limited: { gap: 1 },
  typeName: { marginLeft: 19 },
});
