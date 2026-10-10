export type PinType = 'spot' | 'vehicle';

/** Row in `pins`. photo_url is the photo's path in the private pin-photos bucket. */
export interface Pin {
  id: string;
  trip_id: string;
  member_id: string;
  type: PinType;
  name: string | null;
  lat: number;
  lng: number;
  photo_url: string | null;
  created_at: string;
}

/** A pin with a short-lived link to its photo (members only). */
export interface PinWithPhoto extends Pin {
  photoLink: string | null;
}

export type NewPin = Pick<Pin, 'type' | 'name' | 'lat' | 'lng' | 'photo_url' | 'created_at'>;

/** Row in `locations`: one phone's position and battery at a time (a new row every ~45 s). */
export interface LocationRow {
  member_id: string;
  trip_id: string;
  lat: number;
  lng: number;
  battery: number | null;
  recorded_at: string;
}

/** 'meet' = a meet point; 'split' = Split & rejoin (group B heads to the rejoin point). */
export type GatherKind = 'meet' | 'split';
/** together = everyone got there; cleared = ended by hand. */
export type GatherStatus = 'active' | 'together' | 'cleared';

/** Someone in group B (the name is kept so every phone can show it, demo members too). */
export interface GroupBMember {
  id: string;
  name: string;
}

/** Row in `meet_points`: a meet point or a split's rejoin point. */
export interface MeetPointRow {
  id: string;
  trip_id: string;
  set_by: string | null;
  kind: GatherKind;
  /** "Clan Jetties", or null for a spot tapped on the map. */
  name: string | null;
  lat: number;
  lng: number;
  /** Split: the rejoin stop. */
  stop_id: string | null;
  /** Split: when everyone meets again. */
  rejoin_at: string | null;
  /** Split: who is in group B (everyone else is group A). */
  group_b: GroupBMember[];
  /** The phone's now() when it was set (the fake time in Demo mode). */
  set_at: string;
  status: GatherStatus;
  ended_at: string | null;
  ended_by: string | null;
  created_at: string;
}

export type NewMeetPoint = Pick<
  MeetPointRow,
  'kind' | 'name' | 'lat' | 'lng' | 'stop_id' | 'rejoin_at' | 'group_b' | 'set_at'
>;
