import { describe, expect, it } from 'vitest';

// Travel fee calculation — same formula as TravelFeeService.quote()
function calcTravelFee(distanceKm: number, freeKm: number, perKm: number): number {
  const billableKm = Math.max(0, Math.ceil(distanceKm) - freeKm);
  return billableKm * perKm;
}

// distanceKm rounding: ceil to 2 decimal places (from meters)
function distanceFromMeters(meters: number): number {
  return Math.ceil(meters / 1000 * 100) / 100;
}

describe('Travel fee calculation', () => {
  const FREE_KM = 5;
  const PER_KM = 1000;

  it('no fee within free radius', () => {
    expect(calcTravelFee(3, FREE_KM, PER_KM)).toBe(0);
    expect(calcTravelFee(5, FREE_KM, PER_KM)).toBe(0);
  });

  it('charges for km beyond free radius (ceil-based)', () => {
    // 5.1 km → ceil(5.1) = 6 → 6 - 5 = 1 billable km → 1000
    expect(calcTravelFee(5.1, FREE_KM, PER_KM)).toBe(1000);
  });

  it('charges correctly for 8 km', () => {
    // ceil(8) = 8 → 8 - 5 = 3 → 3000
    expect(calcTravelFee(8, FREE_KM, PER_KM)).toBe(3000);
  });

  it('charges correctly for 8.5 km (ceils to 9)', () => {
    // ceil(8.5) = 9 → 9 - 5 = 4 → 4000
    expect(calcTravelFee(8.5, FREE_KM, PER_KM)).toBe(4000);
  });

  it('does not go below 0 for very short distances', () => {
    expect(calcTravelFee(0.5, FREE_KM, PER_KM)).toBe(0);
  });

  it('respects custom per-km rate', () => {
    expect(calcTravelFee(7, FREE_KM, 2000)).toBe(4000); // 2 billable × 2000
  });
});

describe('Distance from meters conversion', () => {
  it('converts 4500m → 4.5km', () => {
    expect(distanceFromMeters(4500)).toBe(4.5);
  });

  it('rounds up 4501m → 4.51km', () => {
    expect(distanceFromMeters(4501)).toBe(4.51);
  });

  it('converts 10000m → 10km exactly', () => {
    expect(distanceFromMeters(10000)).toBe(10);
  });

  it('rounds up partial km', () => {
    expect(distanceFromMeters(5001)).toBe(5.01);
  });
});
