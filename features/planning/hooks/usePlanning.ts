import { useQuery } from '@tanstack/react-query';

import { fetchOptions, fetchPreferences, fetchVotes } from '../api';

export const planningKeys = {
  preferences: (tripId: string) => ['preferences', tripId] as const,
  options: (tripId: string) => ['options', tripId] as const,
  votes: (tripId: string) => ['votes', tripId] as const,
};

export function usePreferences(tripId: string | undefined) {
  return useQuery({
    queryKey: planningKeys.preferences(tripId ?? ''),
    queryFn: () => fetchPreferences(tripId!),
    enabled: !!tripId,
  });
}

export function useOptions(tripId: string | undefined) {
  return useQuery({
    queryKey: planningKeys.options(tripId ?? ''),
    queryFn: () => fetchOptions(tripId!),
    enabled: !!tripId,
  });
}

export function useVotes(tripId: string | undefined) {
  return useQuery({
    queryKey: planningKeys.votes(tripId ?? ''),
    queryFn: () => fetchVotes(tripId!),
    enabled: !!tripId,
  });
}
