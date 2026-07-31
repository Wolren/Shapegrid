// ══════════════════════════════════════════════════════════════════════════════
// File parsing utilities for GeoJSON and SVG
// ══════════════════════════════════════════════════════════════════════════════

import type { Point2D, CoordSystem, ParsedFile, GeoBounds } from '../types';
import { polyArea } from './engine';
import { normWithCoordSystem, isLikelyLonLat, norm } from './projection';

/** Keep only finite coordinate pairs and thin the ring to at most 150 points
 *  so grid fitting stays fast on large uploaded GeoJSON/SVG files. */
function sanitiseRing(coords: Point2D[]): Point2D[] {
  const valid = coords.filter(
    c => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
  ) as Point2D[];
  if (valid.length > 150) {
    const step = Math.ceil(valid.length / 150);
    return valid.filter((_, i) => i % step === 0 || i === valid.length - 1);
  }
  return valid;
}

export function parseGeoJsonFile(content: string, coordSystem: CoordSystem = 'auto'): ParsedFile {
  const data = JSON.parse(content);
  let coordinates: Point2D[] | undefined;

  if (data.type === 'Polygon') {
    coordinates = data.coordinates?.[0];
  } else if (data.type === 'Feature' && data.geometry?.type === 'Polygon') {
    coordinates = data.geometry.coordinates?.[0];
  } else if (data.type === 'FeatureCollection' && data.features?.length > 0) {
    const feat = data.features.find((f: any) =>
      f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
    );
    if (feat?.geometry?.type === 'Polygon') {
      coordinates = feat.geometry.coordinates?.[0];
    } else if (feat?.geometry?.type === 'MultiPolygon') {
      let largest = feat.geometry.coordinates[0][0];
      let maxArea = 0;
      for (const poly of feat.geometry.coordinates) {
        const ring = poly[0];
        const area = Math.abs(polyArea(ring));
        if (area > maxArea) { maxArea = area; largest = ring; }
      }
      coordinates = largest;
    }
  } else if (data.type === 'MultiPolygon') {
    let largest = data.coordinates[0][0];
    let maxArea = 0;
    for (const poly of data.coordinates) {
      const ring = poly[0];
      const area = Math.abs(polyArea(ring));
      if (area > maxArea) { maxArea = area; largest = ring; }
    }
    coordinates = largest;
  }

  coordinates = sanitiseRing(coordinates ?? []);
  if (coordinates.length < 3) {
    throw new Error('Could not extract polygon from GeoJSON');
  }

  const lons = coordinates.map(([x]) => x);
  const lats = coordinates.map(([, y]) => y);
  const geoBounds: GeoBounds = {
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats)
  };

  let effectiveCs = coordSystem;
  if (coordSystem === 'auto') {
    effectiveCs = isLikelyLonLat(coordinates) ? 'wgs84' : 'planar';
  }

  const poly = normWithCoordSystem(coordinates, coordSystem);
  return { poly, geoBounds, coordSystem: effectiveCs };
}

export function parseSvgFile(content: string): Point2D[] {
  const pathMatch = content.match(/<path[^>]*\sd=["']([^"']+)["']/i);
  if (pathMatch) return parseSvgPath(pathMatch[1]);

  const polygonMatch = content.match(/<polygon[^>]*\spoints=["']([^"']+)["']/i);
  if (polygonMatch) {
    const nums = polygonMatch[1].trim().split(/[\s,]+/).map(Number);
    const pts: Point2D[] = [];
    for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    const valid = sanitiseRing(pts);
    if (valid.length < 3) {
      throw new Error('Could not extract polygon from SVG');
    }
    return norm(valid);
  }
  throw new Error('Could not extract polygon from SVG');
}

export function parseSvgPath(d: string): Point2D[] {
  const points: Point2D[] = [];
  const tokens = d.trim().split(/[\s,]+|(?=[MLZmlz])/);
  let cx = 0, cy = 0;
  for (let i = 0; i < tokens.length;) {
    const cmd = tokens[i++];
    if (!cmd) continue;
    if (cmd === 'M' || cmd === 'L') {
      cx = parseFloat(tokens[i++]); cy = parseFloat(tokens[i++]);
      points.push([cx, cy]);
    } else if (cmd === 'm' || cmd === 'l') {
      cx += parseFloat(tokens[i++]); cy += parseFloat(tokens[i++]);
      points.push([cx, cy]);
    }
  }
  const valid = sanitiseRing(points);
  if (valid.length < 3) {
    throw new Error('SVG path has fewer than 3 valid points');
  }
  return norm(valid);
}
