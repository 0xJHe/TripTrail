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
