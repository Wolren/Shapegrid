/**
 * boundary.ts
 * Parses and normalises polygon boundaries for grid fitting.
 * Supports: raw point arrays, SVG path strings, named presets, country codes, and files.
 */

import { getCountryPolygon, isValidCountryCode } from './countries.js';

export type Point = [number, number];
export type Polygon = Point[];

// ─── Preset shapes ──────────────────────────────────────────────────────────

export const PRESETS: Record<string, Polygon> = {
  /** GitHub-style rounded shield */
  shield: normaliseRaw([
    [50, 0], [100, 20], [100, 60], [50, 100], [0, 60], [0, 20],
  ]),
  /** Simple circle approximation (32 points) */
  circle: Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    return [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)] as Point;
  }),
  /** 5-point star */
  star: Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 50 : 20;
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)] as Point;
  }),
  /** Diamond */
  diamond: normaliseRaw([[50, 0], [100, 50], [50, 100], [0, 50]]),
  /** Heart (approx) */
  heart: (() => {
    const pts: Point[] = [];
    for (let i = 0; i <= 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push([x, y]);
    }
    return normaliseRaw(pts);
  })(),
  /** Classic rectangle */
  rectangle: normaliseRaw([[0, 0], [100, 0], [100, 60], [0, 60]]),
};

// ─── Normalisation ───────────────────────────────────────────────────────────

/** Translate + scale polygon so it fits in [0,1]×[0,1] */
export function normalisePolygon(poly: Polygon): Polygon {
  const xs = poly.map(([x]) => x);
  const ys = poly.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  return poly.map(([x, y]) => [(x - minX) / span, (y - minY) / span]);
}

function normaliseRaw(pts: Point[]): Polygon {
  return normalisePolygon(pts);
}

// ─── SVG path parser (M/L/Z subset, absolute coords only) ────────────────────

export function parseSvgPath(d: string): Polygon {
  const points: Point[] = [];
  const tokens = d.trim().split(/[\s,]+|(?=[MLZmlz])/);
  let cx = 0, cy = 0;

  for (let i = 0; i < tokens.length; ) {
    const cmd = tokens[i++];
    if (!cmd) continue;
    if (cmd === 'M' || cmd === 'L') {
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      cx = x; cy = y;
      points.push([x, y]);
    } else if (cmd === 'm' || cmd === 'l') {
      const dx = parseFloat(tokens[i++]);
      const dy = parseFloat(tokens[i++]);
      cx += dx; cy += dy;
      points.push([cx, cy]);
    } else if (cmd === 'Z' || cmd === 'z') {
      // close path — no new point needed
    } else {
      // skip unknown token
    }
  }
  return normalisePolygon(points);
}

// ─── GeoJSON polygon ─────────────────────────────────────────────────────────

export function parseGeoJsonPolygon(coords: [number, number][]): Polygon {
  return normalisePolygon(coords as Polygon);
}

// ─── Universal loader ────────────────────────────────────────────────────────

export type BoundarySource =
  | { type: 'preset'; name: string }
  | { type: 'polygon'; points: Point[] }
  | { type: 'svgPath'; d: string }
  | { type: 'geojson'; coordinates: [number, number][] }
  | { type: 'country'; code: string }
  | { type: 'file'; path: string; format?: 'geojson' | 'svg' };

export function loadBoundary(src: BoundarySource): Polygon {
  switch (src.type) {
    case 'preset': {
      const p = PRESETS[src.name];
      if (!p) throw new Error(`Unknown preset: ${src.name}. Available: ${Object.keys(PRESETS).join(', ')}`);
      return p;
    }
    case 'polygon':
      return normalisePolygon(src.points);
    case 'svgPath':
      return parseSvgPath(src.d);
    case 'geojson':
      return parseGeoJsonPolygon(src.coordinates);
    case 'country': {
      const poly = getCountryPolygon(src.code);
      if (!poly) {
        throw new Error(`Unknown country code: ${src.code}. Use ISO 3166-1 alpha-2 codes (e.g., US, GB, FR, DE, JP)`);
      }
      return poly;
    }
    case 'file':
      // File loading is handled at a higher level (CLI/action) since it requires file system access
      throw new Error('File boundaries must be loaded using loadBoundaryFromFile()');
  }
}

// ─── Point-in-polygon (ray casting) ──────────────────────────────────────────

export function pointInPolygon(px: number, py: number, poly: Polygon): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Return fraction of a cell's sample points that are inside the polygon */
export function cellCoverage(
  cx: number, cy: number,
  halfW: number, halfH: number,
  poly: Polygon,
  samples = 3
): number {
  let hits = 0;
  const total = samples * samples;
  for (let si = 0; si < samples; si++) {
    for (let sj = 0; sj < samples; sj++) {
      const px = cx - halfW + (halfW * 2 * (si + 0.5)) / samples;
      const py = cy - halfH + (halfH * 2 * (sj + 0.5)) / samples;
      if (pointInPolygon(px, py, poly)) hits++;
    }
  }
  return hits / total;
}

/** Polygon bounding box */
export function boundingBox(poly: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = poly.map(([x]) => x);
  const ys = poly.map(([, y]) => y);
  return {
    minX: Math.min(...xs), minY: Math.min(...ys),
    maxX: Math.max(...xs), maxY: Math.max(...ys),
  };
}

/** Signed area of polygon */
export function polygonArea(poly: Polygon): number {
  let area = 0;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(area) / 2;
}

// ─── File loading helpers ─────────────────────────────────────────────────────

/**
 * Parse GeoJSON content and extract the first polygon
 */
export function parseGeoJsonFile(content: string): Polygon {
  const data = JSON.parse(content);
  
  let coordinates: [number, number][] | undefined;
  
  if (data.type === 'Polygon') {
    coordinates = data.coordinates[0]; // First ring (exterior)
  } else if (data.type === 'Feature' && data.geometry?.type === 'Polygon') {
    coordinates = data.geometry.coordinates[0];
  } else if (data.type === 'FeatureCollection' && data.features?.length > 0) {
    const firstPolygon = data.features.find(
      (f: any) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
    );
    if (firstPolygon?.geometry?.type === 'Polygon') {
      coordinates = firstPolygon.geometry.coordinates[0];
    } else if (firstPolygon?.geometry?.type === 'MultiPolygon') {
      // Use the largest polygon from MultiPolygon
      const rings = firstPolygon.geometry.coordinates;
      let largestRing = rings[0][0];
      let largestArea = 0;
      for (const poly of rings) {
        const ring = poly[0];
        const area = Math.abs(polygonArea(ring as Polygon));
        if (area > largestArea) {
          largestArea = area;
          largestRing = ring;
        }
      }
      coordinates = largestRing;
    }
  } else if (data.type === 'MultiPolygon') {
    // Use the largest polygon
    let largestRing = data.coordinates[0][0];
    let largestArea = 0;
    for (const poly of data.coordinates) {
      const ring = poly[0];
      const area = Math.abs(polygonArea(ring as Polygon));
      if (area > largestArea) {
        largestArea = area;
        largestRing = ring;
      }
    }
    coordinates = largestRing;
  }
  
  if (!coordinates || coordinates.length < 3) {
    throw new Error('Could not extract polygon coordinates from GeoJSON');
  }
  
  return normalisePolygon(coordinates as Polygon);
}

/**
 * Parse SVG file content and extract the first path as a polygon
 */
export function parseSvgFile(content: string): Polygon {
  // Simple regex to find path d attribute
  const pathMatch = content.match(/<path[^>]*\sd=["']([^"']+)["']/i);
  if (pathMatch) {
    return parseSvgPath(pathMatch[1]);
  }
  
  // Try to find polygon points
  const polygonMatch = content.match(/<polygon[^>]*\spoints=["']([^"']+)["']/i);
  if (polygonMatch) {
    const points = polygonMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const polygon: Point[] = [];
    for (let i = 0; i < points.length; i += 2) {
      polygon.push([points[i], points[i + 1]]);
    }
    return normalisePolygon(polygon);
  }
  
  throw new Error('Could not extract polygon from SVG. Expected <path> or <polygon> element.');
}

/**
 * Load boundary from file content (for use in browser or after file read)
 */
export function loadBoundaryFromContent(content: string, format: 'geojson' | 'svg'): Polygon {
  if (format === 'geojson') {
    return parseGeoJsonFile(content);
  } else {
    return parseSvgFile(content);
  }
}

// Re-export for convenience
export { getCountryPolygon, isValidCountryCode, getCountryList, searchCountries } from './countries.js';
