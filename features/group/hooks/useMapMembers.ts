import * as Battery from 'expo-battery';
import { useMemo } from 'react';

import { useDayClosures } from '@/features/recap/hooks/useDayClosures';
import { useMembers, useMyMember } from '@/features/trip/hooks/useTrip';
import { useGroupLocation } from '@/lib/location';
import { markDone, type MapMember } from '../groupMap';
import { useGroupPositions } from './useGroupPositions';
import { useTripDay } from './useTripDay';

/** Someone who can be put in a split's group (positioned or not). */
export interface Person {
  id: string;
  name: string;
  isMe: boolean;
}

/**
 * Everyone on the group map: in Demo mode the replay's members (lib/location), otherwise
 * each member's newest shared position plus this phone's live GPS, during the sharing window.
 * Members who closed the day (Done for today, also in Demo mode) are marked `done`.
 */
export function useMapMembers(tripId: string | undefined) {
  const day = useTripDay(tripId);
  const { window, sharing } = day;
  const members = useMembers(tripId);
  const me = useMyMember(tripId);
  const location = useGroupLocation();
  const level = Battery.useBatteryLevel();
  const demo = location?.source === 'demo';
  const closures = useDayClosures(tripId, day.day);

  const memberList = useMemo(() => members.data ?? [], [members.data]);
  const memberIds = useMemo(() => memberList.map((m) => m.id), [memberList]);
  const since = !demo && sharing && window ? new Date(window.from).toISOString() : null;
  const positions = useGroupPositions(tripId, memberIds, since);

  const myBattery = level >= 0 ? Math.round(level * 100) : null;
  const placed: MapMember[] = useMemo(() => {
    if (demo && location) return location.members.map((m) => ({ ...m, seenAt: location.at }));
    if (!sharing) return [];
    const others = (positions.data ?? [])
      .filter((r) => r.member_id !== me?.id)
      .map((r) => ({
        id: r.member_id,
        name: memberList.find((m) => m.id === r.member_id)?.display_name ?? 'Someone',
        isMe: false,
        lat: r.lat,
        lng: r.lng,
        battery: r.battery,
        seenAt: Date.parse(r.recorded_at),
      }));
    // This phone: the live GPS fix, else the last position it saved.
    const mine = positions.data?.find((r) => r.member_id === me?.id);
    const self: MapMember | null =
      me && location?.me
        ? { id: me.id, name: me.display_name, isMe: true, lat: location.me.lat, lng: location.me.lng, battery: myBattery, seenAt: location.at }
        : me && mine
          ? { id: me.id, name: me.display_name, isMe: true, lat: mine.lat, lng: mine.lng, battery: mine.battery, seenAt: Date.parse(mine.recorded_at) }
          : null;
    return self ? [self, ...others] : others;
  }, [demo, location, sharing, positions.data, me, memberList, myBattery]);
  const mapMembers = useMemo(() => markDone(placed, closures.closed), [placed, closures.closed]);

  // The group: the replay's members in Demo mode, else the trip's members.
  const demoPeople =
    demo && location ? JSON.stringify(location.members.map((m) => ({ id: m.id, name: m.name, isMe: m.isMe }))) : '';
  const people: Person[] = useMemo(() => {
    if (demoPeople) return JSON.parse(demoPeople) as Person[];
    return memberList.map((m) => ({ id: m.id, name: m.display_name, isMe: m.id === me?.id }));
  }, [demoPeople, memberList, me]);

  return { day, members: mapMembers, people, me, memberList, demo, location, closures, loading: members.isLoading };
}
