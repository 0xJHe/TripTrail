import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';

import { now } from '@/lib/clock';
import { deletePin } from '../api';
import { pinTitle } from '../pins';
import type { Pin, PinWithPhoto } from '../types';
import { pinKeys } from './usePinSpot';

/**
 * Delete one of my pins after "Delete this pin?". It goes from this phone's list straight away;
 * everyone else's goes through Realtime. A stop made from it with Add to plan stays.
 */
export function useDeletePin(tripId: string | undefined, onDeleted?: (pin: Pin) => void) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(pin: Pin) {
    if (!tripId) return;
    setDeleting(pin.id);
    setError(null);
    try {
      await deletePin(pin, now().toISOString());
      queryClient.setQueryData<PinWithPhoto[]>(pinKeys.pins(tripId), (old) => old?.filter((p) => p.id !== pin.id));
      onDeleted?.(pin);
      await queryClient.invalidateQueries({ queryKey: pinKeys.pins(tripId) });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't delete the pin. Try again.");
    } finally {
      setDeleting(null);
    }
  }

  const ask = (pin: Pin) =>
    Alert.alert(
      'Delete this pin?',
      `"${pinTitle(pin)}" and its photo will be gone for everyone in the trip. If it's in the plan, the stop stays.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void run(pin) },
      ],
    );

  return { ask, deleting, error };
}
