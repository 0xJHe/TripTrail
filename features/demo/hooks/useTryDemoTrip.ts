import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';

import { useDisplayName } from '@/features/trip/authStore';
import { useCurrentTrip } from '@/features/trip/store';
import { startDemoTrip } from '../api';
import { demoTripReason } from '../errors';

/**
 * Settings > Try a demo trip: makes this person's private copy of the Penang demo trip (or
 * finds their unfinished one), makes it the open trip and shows its Day plan.
 */
export function useTryDemoTrip() {
  const queryClient = useQueryClient();
  const name = useDisplayName();
  const setCurrentTrip = useCurrentTrip((s) => s.setCurrentTrip);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const { tripId } = await startDemoTrip(name);
      await queryClient.invalidateQueries({ queryKey: ['myTrips'] });
      setCurrentTrip(tripId);
      router.replace('/plan');
    } catch (e) {
      console.warn('Try a demo trip failed:', e instanceof Error ? e.message : e);
      setError(demoTripReason(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return { start, busy, error };
}
