import { canDeletePin, dropLabel, photoPath, pinDistance, pinInPlan, pinName, pinsToday, pinForm, pinStopRoute, pinTitle } from '@/features/group/pins';
import { readStopForm } from '@/features/planning/stopForm';
import type { Pin } from '@/features/group/types';
import { offsetMeters } from '@/lib/distance';

const here = { lat: 5.4172, lng: 100.3364 };

function pin(extra: Partial<Pin> = {}): Pin {
  return {
    id: 'p1',
    trip_id: 't1',
    member_id: 'm1',
    type: 'spot',
    name: 'Cendol stall',
    ...here,
    photo_url: null,
    created_at: new Date(2026, 9, 12, 12, 58).toISOString(),
    ...extra,
  };
}

describe('pin names', () => {
  it('uses the typed name, else "Pinned spot" / "Car"', () => {
    expect(pinName('spot', '  Cendol stall  ')).toBe('Cendol stall');
    expect(pinName('spot', '')).toBe('Pinned spot');
    expect(pinName('vehicle', ' ')).toBe('Car');
  });

  it('vehicles read "Car · Komtar car park L3"', () => {
    expect(pinTitle({ type: 'vehicle', name: 'Komtar car park L3' })).toBe('Car · Komtar car park L3');
    expect(pinTitle({ type: 'vehicle', name: 'Car' })).toBe('Car');
    expect(pinTitle({ type: 'spot', name: 'Line Clear nasi kandar' })).toBe('Line Clear nasi kandar');
    expect(pinTitle({ type: 'spot', name: null })).toBe('Pinned spot');
  });
});

describe('pinDistance', () => {
  it('spots: metres or km away; vehicles: minutes walking', () => {
    const p = pin(offsetMeters(here, 400, 0));
    expect(pinDistance(p, here)).toBe('400 m away');
    expect(pinDistance(pin(offsetMeters(here, 2300, 0)), here)).toBe('2.3 km away');
    expect(pinDistance({ ...p, type: 'vehicle' }, here)).toBe('5 min walk');
    expect(pinDistance(pin(), here)).toBe('right here');
    expect(pinDistance(p, null)).toBeNull();
  });
});

describe('pinsToday', () => {
  it("keeps today's pins (by the clock it is given), newest first", () => {
    const pins = [
      pin({ id: 'old', created_at: new Date(2026, 9, 11, 20, 0).toISOString() }),
      pin({ id: 'a', created_at: new Date(2026, 9, 12, 9, 12).toISOString() }),
      pin({ id: 'b', created_at: new Date(2026, 9, 12, 12, 58).toISOString() }),
    ];
    expect(pinsToday(pins, new Date(2026, 9, 12, 15, 10)).map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('Add to plan', () => {
  it('opens Add a stop for the day with the pin', () => {
    expect(pinStopRoute('t1', 'p1', 2)).toEqual({
      pathname: '/trip/[id]/stop/[stopId]',
      params: { id: 't1', stopId: 'new', day: '2', pin: 'p1' },
    });
  });

  it("fills the form with the pin's name and location, times left for the person to pick", () => {
    const form = pinForm(pin(), 2);
    expect(form).toMatchObject({ kind: 'place', day: 2, name: 'Cendol stall', time: '', endTime: '', price: '' });
    expect(form.place).toEqual({ placeId: null, address: null, lat: here.lat, lng: here.lng, pinned: true });
  });

  it('saves at the pin, food or not from the name, and then counts as in the plan', () => {
    const read = readStopForm({ ...pinForm(pin({ name: 'Line Clear nasi kandar' }), 1), time: '15:00', endTime: '15:30' }, '2026-10-12');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.fields).toMatchObject({ day_number: 1, name: 'Line Clear nasi kandar', lat: here.lat, lng: here.lng, category: 'food', is_booked: false });
    expect(pinInPlan(pin({ name: 'Line Clear nasi kandar' }), [{ ...read.fields, status: 'planned' }])).toBe(true);
    const spot = readStopForm({ ...pinForm(pin({ name: 'Viewpoint' }), 1), time: '15:00', endTime: '15:30' }, '2026-10-12');
    expect(spot.ok && spot.fields.category).toBe('sight');
  });

  it('knows when a pin is already in the plan', () => {
    const p = pin();
    const stop = { name: 'Cendol stall', ...here, status: 'planned' as const };
    expect(pinInPlan(p, [stop])).toBe(true);
    expect(pinInPlan(p, [{ ...stop, status: 'dropped' }])).toBe(false);
    expect(pinInPlan(p, [{ ...stop, ...offsetMeters(here, 50, 0) }])).toBe(false);
  });
});

it('photoPath puts the photo in the trip folder', () => {
  expect(photoPath('t1', 'm1', new Date(1000))).toMatch(/^t1\/m1-1000-[a-z0-9]+\.jpg$/);
});

describe('dropLabel (the tag over the red pin on the small map)', () => {
  it('shows the name as it is typed, with the Spot / Vehicle icon', () => {
    expect(dropLabel('spot', 'Cendol')).toBe('📍 Cendol');
    expect(dropLabel('vehicle', '  Komtar L3 ')).toBe('🚗 Komtar L3');
  });

  it('says "Pin drops here" while the name is empty', () => {
    expect(dropLabel('spot', '')).toBe('📍 Pin drops here');
    expect(dropLabel('vehicle', '   ')).toBe('🚗 Pin drops here');
  });
});

describe('canDeletePin', () => {
  it('only the person who pinned it', () => {
    expect(canDeletePin(pin({ member_id: 'm1' }), 'm1')).toBe(true);
    expect(canDeletePin(pin({ member_id: 'm1' }), 'm2')).toBe(false);
    expect(canDeletePin(pin(), null)).toBe(false);
    expect(canDeletePin(pin(), undefined)).toBe(false);
  });
});
