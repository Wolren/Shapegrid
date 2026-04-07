// ══════════════════════════════════════════════════════════════════════════════
// Coordinate system projection utilities
// ══════════════════════════════════════════════════════════════════════════════

import type { Point2D, CoordSystem } from '../types';

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
