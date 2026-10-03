import { StyleSheet } from 'react-native';

import { Chip, Chips } from '@/components/ui/Chip';

interface ChipPickerProps {
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
  tone?: 'teal' | 'red';
  /** Dim the unpicked chips (e.g. 3 must-haves already chosen). */
  full?: boolean;
}

/** Row of compact preference chips (prototype .pref .chip). */
export function ChipPicker({ items, selected, onToggle, tone, full }: ChipPickerProps) {
  return (
    <Chips gap={6}>
      {items.map((item) => (
        <Chip
          key={item}
          label={item}
          tone={tone}
          selected={selected.includes(item)}
          dimmed={full}
          onPress={() => onToggle(item)}
          style={styles.chip}
        />
      ))}
    </Chips>
  );
}

const styles = StyleSheet.create({
  chip: { paddingVertical: 6, paddingHorizontal: 11 },
});
