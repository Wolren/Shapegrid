// ══════════════════════════════════════════════════════════════════════════════
// Coordinate system projection utilities
// ══════════════════════════════════════════════════════════════════════════════

import type { Point2D, CoordSystem, GeoBounds } from '../types';

// Approximate ground distance of one degree of latitude, in km.
const KM_PER_DEG = 111.32;

export function norm(pts: Point2D[]): Point2D[] {
  const xs = pts.map(([x]) => x), ys = pts.map(([,y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  return pts.map(([x,y]) => [(x - minX) / span, (y - minY) / span] as Point2D);
}

export function isLikelyLonLat(pts: Point2D[]): boolean {
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const maxAbsX = Math.max(...xs.map(Math.abs));
  const maxAbsY = Math.max(...ys.map(Math.abs));
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  return maxAbsX > 1.5 || maxAbsY > 1.5 || spanX > 2 || spanY > 2;
}

export function projectWgs84(pts: Point2D[]): Point2D[] {
  const ys = pts.map(([, y]) => y);
  const refLat = (Math.max(...ys) + Math.min(...ys)) / 2;
  const latRad = (refLat * Math.PI) / 180;
  const cosFactor = Math.cos(latRad);
  return pts.map(([lon, lat]) => [lon * cosFactor, lat] as Point2D);
}

export function projectMercator(pts: Point2D[]): Point2D[] {
  const MAX_LAT = 85.05;
  return pts.map(([lon, lat]) => {
    const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
    const latRad = (clampedLat * Math.PI) / 180;
    const y = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    return [lon, y] as Point2D;
  });
}

export function normWithCoordSystem(pts: Point2D[], coordSystem: CoordSystem | null): Point2D[] {
  let cs = coordSystem || 'auto';
  if (cs === 'auto') {
    cs = isLikelyLonLat(pts) ? 'wgs84' : 'planar';
  }
  
  let projected = pts;
  if (cs === 'wgs84') {
    projected = projectWgs84(pts);
  } else if (cs === 'mercator') {
    projected = projectMercator(pts);
  }
  
  let normalized = norm(projected);
  
  // Flip Y for geographic coordinates
  if (cs === 'wgs84' || cs === 'mercator') {
    normalized = normalized.map(([x, y]) => [x, 1 - y] as Point2D);
  }
  
  return normalized;
}

// ── Real-world unit conversion (km / km²) ───────────────────────────────────

/**
 * True when geographic data is loaded: bounds are set and the coordinate
 * system is wgs84 or mercator.
 */
export function isGeoState(
  geoBounds: GeoBounds | null,
  coordSystem: CoordSystem | null
): geoBounds is GeoBounds {
  return (
    geoBounds !== null &&
    (coordSystem === 'wgs84' || coordSystem === 'mercator')
  );
}

/**
 * Scale factors converting normalized-unit distances/areas to km / km² for
 * the current geo dataset, or null when no geographic data is loaded.
 *
 * Derivation (mirrors normWithCoordSystem exactly): norm() shifts projected
 * coords by their min and divides by span = max(projSpanX, projSpanY).
 * So for a normalized delta dn, the projected delta is dn * span.
 *
 *  - wgs84: projectWgs84 maps lon -> lon * cos(midLatRad), lat -> lat.
 *      dLon(deg) = dn * span / cos(midLatRad)
 *      dKm_x = dLon(deg) * 111.32 * cos(midLatRad) = dn * span * 111.32
 *    The cos(midLatRad) terms cancel, giving kmPerUnitX = kmPerUnitY = span * 111.32.
 *
 *  - mercator: projectMercator maps lon -> lon, lat -> mercY(lat), which is
 *    conformal: locally d(latRad)/d(mercY) = cos(lat). Evaluating at midLat:
 *      dKm_x = dn * span * 111.32 * cos(midLatRad)
 *      dKm_y = dn * span * (180/π) * cos(midLatRad) * 111.32   (radians -> degrees)
 *    The (180/π) factor appears because mercY units are radian-like, so the
 *    y-axis scale exceeds the x-axis scale by 57.3×.
 */
export function geoKmPerUnit(
  geoBounds: GeoBounds | null,
  coordSystem: CoordSystem | null
): { kmPerUnitX: number; kmPerUnitY: number } | null {
  if (!isGeoState(geoBounds, coordSystem)) return null;
  const { minLon, maxLon, minLat, maxLat } = geoBounds;

  const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
  const cosMid = Math.cos(midLatRad);

  // Recompute the projected span exactly as normWithCoordSystem does.
  let projSpanX: number;
  let projSpanY: number;
  if (coordSystem === 'wgs84') {
    projSpanX = (maxLon - minLon) * cosMid;
    projSpanY = maxLat - minLat;
  } else {
    // mercator
    const mercY = (lat: number): number => {
      const clamped = Math.max(-85.05, Math.min(85.05, lat));
      const latRad = (clamped * Math.PI) / 180;
      return Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    };
    projSpanX = maxLon - minLon;
    projSpanY = mercY(maxLat) - mercY(minLat);
  }
  const span = Math.max(projSpanX, projSpanY) || 1;

  if (coordSystem === 'wgs84') {
    // cos(midLatRad) cancels between the projection and the km conversion.
    const perUnit = span * KM_PER_DEG;
    return { kmPerUnitX: perUnit, kmPerUnitY: perUnit };
  }
  // mercator: mercY units are radian-like; x is in degrees.
  const perUnitX = span * KM_PER_DEG * cosMid;
  const perUnitY = span * KM_PER_DEG * cosMid * (180 / Math.PI);
  return { kmPerUnitX: perUnitX, kmPerUnitY: perUnitY };
}
