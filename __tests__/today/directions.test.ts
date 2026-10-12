import { directionsOrigin, directionsUrl } from '@/features/today/directions';
import { getGroupLocation } from '@/lib/location';

jest.mock('@/lib/location', () => ({ getGroupLocation: jest.fn(), useLocationSource: jest.fn(() => 'gps') }));

const BASE = 'https://www.google.com/maps/dir/?api=1';

describe('directionsUrl: one Google Maps link for every Directions button', () => {
  it('a stop with name + address: "name, address" as the destination, no origin, no travel mode', () => {
    const url = directionsUrl({ lat: 5.4152, lng: 100.3376, name: 'Armenian Street', address: 'George Town, Penang' });
    expect(url).toBe(`${BASE}&destination=Armenian%20Street%2C%20George%20Town%2C%20Penang`);
    expect(url).not.toMatch(/travelmode/);
    expect(url).not.toMatch(/origin=/);
  });

  it('adds the Google place ID so the place shows by name', () => {
    expect(
      directionsUrl({ lat: 5.4249, lng: 100.269, name: 'Penang Hill', address: 'Air Itam, Penang', place_id: 'ChIJ_hill' }),
    ).toBe(`${BASE}&destination=Penang%20Hill%2C%20Air%20Itam%2C%20Penang&destination_place_id=ChIJ_hill`);
  });

  it('a place ID without an address: the name with the place ID', () => {
    expect(directionsUrl({ lat: 5.4249, lng: 100.269, name: 'Penang Hill', address: null, place_id: 'ChIJ_hill' })).toBe(
      `${BASE}&destination=Penang%20Hill&destination_place_id=ChIJ_hill`,
    );
  });

  it('pins and meet points (name, no address or place ID): coordinates', () => {
    expect(directionsUrl({ lat: 5.4152, lng: 100.3376, name: 'Nice mural' })).toBe(`${BASE}&destination=5.4152,100.3376`);
    expect(directionsUrl({ lat: -8.65, lng: 115.2167, name: 'Clan Jetties' })).toBe(`${BASE}&destination=-8.65,115.2167`);
  });

  it('demo mode: starts from the given origin', () => {
    expect(directionsUrl({ lat: 5.4249, lng: 100.269 }, { lat: 5.4145, lng: 100.3292 })).toBe(
      `${BASE}&origin=5.4145,100.3292&destination=5.4249,100.269`,
    );
  });

  it('falls back to the name + address when there is no position', () => {
    expect(directionsUrl({ lat: null, lng: null, name: 'Kek Lok Si', address: 'Air Itam' })).toBe(
      `${BASE}&destination=Kek%20Lok%20Si%2C%20Air%20Itam`,
    );
    expect(directionsUrl({ lat: null, lng: null, name: 'Kek Lok Si' })).toBe(`${BASE}&destination=Kek%20Lok%20Si`);
  });
});

describe('directionsOrigin', () => {
  const mocked = getGroupLocation as jest.Mock;
  beforeEach(() => mocked.mockReset());

  it('real mode: none, and no location read', async () => {
    expect(await directionsOrigin('gps')).toBeNull();
    expect(mocked).not.toHaveBeenCalled();
  });

  it("demo mode: the demo group's centre", async () => {
    mocked.mockResolvedValue({ source: 'demo', center: { lat: 5.41, lng: 100.33 }, me: null, members: [] });
    expect(await directionsOrigin('demo')).toEqual({ lat: 5.41, lng: 100.33 });
  });

  it('demo mode without a route: none', async () => {
    mocked.mockResolvedValue(null);
    expect(await directionsOrigin('demo')).toBeNull();
  });
});
