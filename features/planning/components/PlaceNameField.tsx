import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Field } from '@/components/ui/Field';
import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';
import { usePlaceSearch } from '../hooks/usePlaceSearch';
import type { FormPlace } from '../stopForm';
import { PlaceSuggestions } from './PlaceSuggestions';

interface PlaceNameFieldProps {
  tripId: string;
  name: string;
  place: FormPlace | null;
  placeholder: string;
  /** Search Google Places as the name is typed (not for flights). */
  search: boolean;
  near: { lat: number; lng: number } | null;
  onChange: (patch: { name?: string; place?: FormPlace | null }) => void;
}

/** Stop name with real-place suggestions, and the picked place's address under it. */
export function PlaceNameField({ tripId, name, place, placeholder, search, near, onChange }: PlaceNameFieldProps) {
  // What to search for: only text the user typed, not a name filled in by a pick.
  const [query, setQuery] = useState<string | null>(null);
  const places = usePlaceSearch(tripId, search ? query : null, near);

  async function pick(s: { placeId: string; name: string; detail: string }) {
    setQuery(null);
    onChange({ name: s.name });
    const found = await places.pick(s);
    if (found) onChange({ name: found.name || s.name, place: { placeId: found.placeId, address: found.address, lat: found.lat, lng: found.lng } });
  }

  return (
    <View style={{ gap: 8 }}>
      <Field
        value={name}
        onChangeText={(text) => {
          setQuery(text);
          onChange({ name: text });
        }}
        placeholder={placeholder}
        autoCorrect={false}
        testID="stop-name"
      />
      {search && query != null ? (
        <PlaceSuggestions
          suggestions={places.suggestions}
          searching={places.searching}
          limited={places.limited}
          failed={places.failed}
          onPick={pick}
        />
      ) : null}
      {place ? (
        <View style={styles.place}>
          <Ionicons name="location" size={14} color={colors.tealDark} />
          <Txt variant="s11" style={{ flex: 1 }} numberOfLines={2}>
            {place.address ?? 'Location from the plan'}
          </Txt>
          <Pressable
            onPress={() => onChange({ place: null })}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Remove location">
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  place: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
