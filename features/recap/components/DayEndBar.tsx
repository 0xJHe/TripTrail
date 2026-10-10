import { BottomBar } from '@/components/ui/BottomBar';
import { Button } from '@/components/ui/Button';
import type { DayEndState } from '../hooks/useDayEnd';

/** After "Keep going": Done for today (always in view) and + Add more stops, pinned to the bottom. */
export function DayEndBar({ end }: { end: DayEndState }) {
  return (
    <BottomBar>
      <Button label="Done for today" onPress={end.openDone} testID="day-end-bar-done" />
      <Button label="+ Add more stops" variant="secondary" size="sm" onPress={end.addStop} testID="day-end-bar-add" />
    </BottomBar>
  );
}

/** Space to leave under the Today list so the two pinned buttons don't cover it. */
export const DAY_END_BAR_SPACE = 150;
