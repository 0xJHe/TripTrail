import { demoRainOptions, demoSuggestion } from '@/features/today/demoPlaces';
import { haversineMeters } from '@/lib/distance';

const group = { lat: 5.4152, lng: 100.3376 };

describe('Demo mode made-up places', () => {
  it('gives the running-early card one nearby place', () => {
    const s = demoSuggestion(group);
    expect(s.name).toBeTruthy();
    expect(s.outdoor).toBe(false);
    expect(Math.abs(haversineMeters(group, s) - s.distanceM)).toBeLessThan(2);
    expect(s.distanceM).toBeLessThan(1000);
    expect(s.walkMin).toBeGreaterThanOrEqual(1);
    expect(s.price).toBeGreaterThan(0);
  });

  it('gives the rain card three indoor options, nearest first', () => {
    const options = demoRainOptions(group);
    expect(options).toHaveLength(3);
    expect(new Set(options.map((o) => o.placeId)).size).toBe(3);
    const d = options.map((o) => o.distanceM);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    for (const o of options) {
      expect(Math.abs(haversineMeters(group, o) - o.distanceM)).toBeLessThan(2);
      expect(o.distanceM).toBeLessThan(1200);
      expect(o.ride).toBe(false);
    }
  });
});
