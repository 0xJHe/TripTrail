import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { stopBackgroundSharing } from '@/features/group/backgroundShare';
import { leaveTrip } from '../api';
import { useCurrentTrip } from '../store';

/**
 * Leave trip (Group tab): stops this phone's background sharing, removes my member row (or
 * deletes the trip when I'm the last member), closes the trip and goes back to the home screen.
 */
export function useLeaveTrip(tripId: string | undefined, memberId: string | undefined, lastMember: boolean) {
  const queryClient = useQueryClient();
  const setCurrentTrip = useCurrentTrip((s) => s.setCurrentTrip);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    if (!tripId || !memberId || leaving) return;
    setLeaving(true);
    setError(null);
    try {
      await stopBackgroundSharing().catch(() => {});
      await leaveTrip(tripId, memberId, lastMember);
    } catch (e) {
      console.warn('Leaving the trip failed:', e instanceof Error ? e.message : e);
      setError("Couldn't leave the trip. Check the connection and try again.");
      setLeaving(false);
      return;
    }
    setCurrentTrip(null);
    router.replace('/home');
    // The trip's cached data is no longer mine to see.
    queryClient.removeQueries({ predicate: (q) => q.queryKey[1] === tripId });
    queryClient.invalidateQueries({ queryKey: ['myTrips'] });
  }

  return { leave, leaving, error };
}
