import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/lib/theme';
import { Txt } from './Txt';

export interface PickerOption<T extends string> {
  value: T;
  label: string;
}

interface PickerSheetProps<T extends string> {
  visible: boolean;
  title: string;
  options: PickerOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}

/** Bottom sheet with a list of choices. */
export function PickerSheet<T extends string>({ visible, title, options, value, onSelect, onClose }: PickerSheetProps<T>) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <Txt variant="h15" style={styles.title}>
          {title}
        </Txt>
        <ScrollView style={{ maxHeight: 380 }}>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  onSelect(o.value);
                  onClose();
                }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.background }]}>
                <Txt variant="b13" weight={on ? 'bold' : 'medium'} color={on ? colors.tealDark : colors.text} style={{ fontSize: 15 }}>
                  {o.label}
                </Txt>
                {on ? <Ionicons name="checkmark" size={20} color={colors.teal} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,40,79,0.45)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 18,
    paddingHorizontal: 8,
  },
  title: { paddingHorizontal: 12, marginBottom: 6 },
  row: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
