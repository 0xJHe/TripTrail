import { photoPath, pinDistance, pinInPlan, pinName, pinsToday, pinTitle, pinToStop } from '@/features/group/pins';
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
  it('makes a stop today, at the next quarter hour, 30 min, free, at the pin', () => {
    const stop = pinToStop(pin(), 2, 5, new Date(2026, 9, 12, 15, 7));
    expect(stop).toMatchObject({
      day_number: 2,
      position: 5,
      name: 'Cendol stall',
      lat: here.lat,
      lng: here.lng,
      planned_time: new Date(2026, 9, 12, 15, 15).toISOString(),
      planned_end: new Date(2026, 9, 12, 15, 45).toISOString(),
      price: 0,
      is_booked: false,
      category: 'sight',
    });
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
