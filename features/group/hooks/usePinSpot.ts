import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';

import { addStop } from '@/features/planning/api';
import { useDayPlan } from '@/features/planning/hooks/useDayPlan';
import { planningKeys } from '@/features/planning/hooks/usePlanning';
import { tripDayOn } from '@/features/today/todayPlan';
import { useMyMember } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { useCurrentTrip } from '@/features/trip/store';
import { now, useNow } from '@/lib/clock';
import { haversineMeters } from '@/lib/distance';
import { getGroupLocation, useGroupLocation } from '@/lib/location';
import { addPin, fetchPins, uploadPinPhoto } from '../api';
import { photoPath, pinInPlan, pinName, pinsToday, pinToStop } from '../pins';
import type { Pin, PinType } from '../types';

export const pinKeys = { pins: (tripId: string) => ['pins', tripId] as const };

/** The header names a stop this close as "Near …". */
const NEAR_STOP_M = 300;
const PICK: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, allowsEditing: false };

/** Everything the Pin spot screen needs: the form, today's pins (live), drop / add to plan. */
export function usePinSpot() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const plan = useDayPlan(tripId);
  const me = useMyMember(tripId);
  const time = useNow();
  const location = useGroupLocation();
  const queryClient = useQueryClient();
  const pins = useQuery({ queryKey: pinKeys.pins(tripId ?? ''), queryFn: () => fetchPins(tripId!), enabled: !!tripId });
  useTripRealtime(tripId, ['pins']);

  const [type, setType] = useState<PinType>('spot');
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);

  // "Add to plan" goes on today's trip day, if today is one.
  const day = plan.trip?.stage === 'decided' ? tripDayOn(plan.start, time) : 0;
  const planDay = day >= 1 && day <= plan.days ? day : null;
  const dayStops = useMemo(() => plan.stops.filter((s) => s.day_number === planDay), [plan.stops, planDay]);
  const here = location?.me ?? location?.center ?? null;
  // For the header: "Near Kek Lok Si Temple".
  const nearStop = useMemo(() => {
    if (!here) return null;
    const close = dayStops
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({ s, d: haversineMeters(here, { lat: s.lat!, lng: s.lng! }) }))
      .filter((x) => x.d <= NEAR_STOP_M)
      .sort((a, b) => a.d - b.d)[0];
    return close?.s ?? null;
  }, [here, dayStops]);

  async function pickPhoto(source: 'camera' | 'library') {
    setError(null);
    const perm =
      source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(source === 'camera' ? 'Camera access is off for TripTrail.' : 'Photo access is off for TripTrail.');
      return;
    }
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(PICK) : await ImagePicker.launchImageLibraryAsync(PICK);
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0].uri);
  }

  async function drop() {
    if (!tripId || !me) return;
    setDropping(true);
    setError(null);
    setDropped(null);
    try {
      const loc = await getGroupLocation();
      const at = loc?.me ?? loc?.center;
      if (!at) throw new Error("Couldn't find your location. Check that location is on and try again.");
      const t = now();
      let path: string | null = null;
      if (photo) {
        path = photoPath(tripId, me.id, t);
        await uploadPinPhoto(path, photo);
      }
      const saved = pinName(type, name);
      await addPin(tripId, me.id, { type, name: saved, lat: at.lat, lng: at.lng, photo_url: path, created_at: t.toISOString() });
      await queryClient.invalidateQueries({ queryKey: pinKeys.pins(tripId) });
      setName('');
      setPhoto(null);
      setDropped(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the pin. Try again.");
    } finally {
      setDropping(false);
    }
  }

  async function addToPlan(pin: Pin) {
    if (!tripId || planDay == null) return;
    setAdding(pin.id);
    setError(null);
    try {
      const position = Math.max(-1, ...dayStops.map((s) => s.position)) + 1;
      await addStop(tripId, pinToStop(pin, planDay, position, now()));
      await queryClient.invalidateQueries({ queryKey: planningKeys.stops(tripId) });
    } catch {
      setError("Couldn't add it to the plan. Try again.");
    } finally {
      setAdding(null);
    }
  }

  const memberName = (id: string) =>
    id === me?.id ? 'You' : (plan.members.find((m) => m.id === id)?.display_name ?? 'Someone');

  return {
    tripId,
    trip: plan.trip,
    canPin: !!me,
    here,
    nearStop,
    pins: pinsToday(pins.data ?? [], time),
    pinsLoading: pins.isLoading,
    inPlan: (pin: Pin) => pinInPlan(pin, dayStops),
    planDay,
    memberName,
    form: { type, setType, name, setName, photo, setPhoto, pickPhoto },
    drop,
    dropping,
    dropped,
    addToPlan,
    adding,
    error,
  };
}
