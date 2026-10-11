import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useMembers, useMyMember, useTrip } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { organiserId } from '@/features/trip/members';
import { fetchAnsweredIds } from '../api';
import { groupRows } from '../groupList';
import { useMapMembers } from './useMapMembers';

/**
 * Everything the Group tab shows for a trip: the members list with each person's live status
 * (location, battery, Done for today, preferences answered; demo members in Demo mode), live
 * through Realtime (joins, leaves, preferences, closures, positions).
 */
export function useGroupList(tripId: string | undefined) {
  const trip = useTrip(tripId);
  const members = useMembers(tripId);
  const me = useMyMember(tripId);
  const map = useMapMembers(tripId);
  // trips: someone left (members_changed_at) or the organiser changed.
  useTripRealtime(tripId, ['members', 'trips', 'preferences']);
  const answered = useQuery({
    queryKey: ['preferences', tripId ?? '', 'answered'],
    queryFn: () => fetchAnsweredIds(tripId!),
    enabled: !!tripId,
  });

  const memberList = useMemo(() => members.data ?? [], [members.data]);
  const organiser = organiserId(memberList, trip.data?.created_by);
  const time = map.day.time.getTime();
  const rows = useMemo(
    () =>
      groupRows({
        members: memberList,
        meId: me?.id ?? null,
        organiserId: organiser,
        placed: map.members,
        closed: map.closures.closed,
        answered: new Set(answered.data ?? []),
        decided: trip.data?.stage === 'decided',
        demo: map.demo,
        time,
      }),
    [memberList, me, organiser, map.members, map.closures.closed, answered.data, trip.data?.stage, map.demo, time],
  );

  return {
    trip: trip.data,
    me,
    rows,
    /** Only I am left in the trip: leaving deletes it. */
    lastMember: memberList.length === 1 && !!me,
    loading: trip.isLoading || members.isLoading,
    error: trip.error ?? members.error,
    refetch: () => Promise.all([trip.refetch(), members.refetch(), answered.refetch()]),
  };
}
