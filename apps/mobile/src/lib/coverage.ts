import type { ServiceArea } from '../stores/appContent';

// Haversine distance in meters between two lat/lng points.
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export type CoverageResult = {
  covered: boolean;
  nearestAreaName?: string;
  distanceM?: number;
};

// User dianggap "covered" kalau lokasi mereka berada dalam radius_m dari salah satu service_area.
// Kalau gak ada service_area sama sekali (admin belum config), default ALLOW (jangan blok user).
export function checkCoverage(
  userLoc: { lat: number; lng: number } | null,
  areas: ServiceArea[],
): CoverageResult {
  if (areas.length === 0) return { covered: true };
  if (!userLoc) return { covered: false };

  let nearest: { area: ServiceArea; distance: number } | null = null;
  for (const a of areas) {
    const d = distanceMeters(userLoc, { lat: a.lat, lng: a.lng });
    if (d <= a.radiusM) return { covered: true, nearestAreaName: a.name, distanceM: d };
    if (!nearest || d < nearest.distance) nearest = { area: a, distance: d };
  }
  return {
    covered: false,
    nearestAreaName: nearest?.area.name,
    distanceM: nearest?.distance,
  };
}
