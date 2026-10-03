import { useQuery } from '@tanstack/react-query';

import { fetchMembers, fetchMyTrips, fetchTrip } from '../api';
import { useUserId } from '../authStore';

export const tripKeys = {
  trip: (id: string) => ['trip', id] as const,
  members: (id: string) => ['members', id] as const,
  myTrips: (userId: string | null) => ['myTrips', userId] as const,
};

export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: tripKeys.trip(id ?? ''),
    queryFn: () => fetchTrip(id!),
    enabled: !!id,
  });
}

export function useMembers(tripId: string | undefined) {
  return useQuery({
    queryKey: tripKeys.members(tripId ?? ''),
    queryFn: () => fetchMembers(tripId!),
    enabled: !!tripId,
  });
}

export function useMyTrips() {
  const userId = useUserId();
  return useQuery({
    queryKey: tripKeys.myTrips(userId),
    queryFn: () => fetchMyTrips(userId!),
    enabled: !!userId,
  });
}

/** My own row in the trip's members list. */
export function useMyMember(tripId: string | undefined) {
  const userId = useUserId();
  const members = useMembers(tripId);
  return members.data?.find((m) => m.user_id === userId) ?? null;
}
