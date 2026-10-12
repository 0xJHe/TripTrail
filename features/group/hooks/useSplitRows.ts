import { useQuery } from '@tanstack/react-query';

import { fetchSplits } from '../api';
import { meetKeys } from './useMeetPoints';

/**
 * Every split of the trip (for group B's own stops). Under the meet points' query key, so the
 * Realtime refresh on meet_points (Map and Today tabs) refreshes it too.
 */
export function useSplitRows(tripId: string | undefined) {
  return useQuery({
    queryKey: [...meetKeys.all(tripId ?? ''), 'splits'],
    queryFn: () => fetchSplits(tripId!),
    enabled: !!tripId,
  });
}
