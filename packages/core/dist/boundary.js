/**
 * boundary.ts
 * Parses and normalises polygon boundaries for grid fitting.
 * Supports: raw point arrays, SVG path strings, named presets, country codes, and files.
 */
import { getCountryPolygon } from './countries.js';
// ─── Preset shapes ──────────────────────────────────────────────────────────
export const PRESETS = {
    /** GitHub-style rounded shield */
    shield: normaliseRaw([
        [50, 0], [100, 20], [100, 60], [50, 100], [0, 60], [0, 20],
    ]),
    /** Simple circle approximation (32 points) */
    circle: Array.from({ length: 32 }, (_, i) => {
        const a = (i / 32) * Math.PI * 2;
        return [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)];
    }),
    /** 5-point star */
    star: Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 50 : 20;
        return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
    }),
    /** Diamond */
    diamond: normaliseRaw([[50, 0], [100, 50], [50, 100], [0, 50]]),
    /** Heart (approx) */
    heart: (() => {
        const pts = [];
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
export function normalisePolygon(poly) {
    if (poly.length === 0)
        return [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (y < minY)
            minY = y;
        if (y > maxY)
            maxY = y;
    }
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    return poly.map(([x, y]) => [(x - minX) / span, (y - minY) / span]);
}
function normaliseRaw(pts) {
    return normalisePolygon(pts);
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function isLikelyLonLat(poly) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (y < minY)
            minY = y;
        if (y > maxY)
            maxY = y;
    }
    const withinGeoBounds = minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90;
    if (!withinGeoBounds)
        return false;
    // Avoid misclassifying already-normalised 0..1 shapes as geographic coordinates.
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const magnitudeSuggestsDegrees = Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY)) > 1.5;
    return magnitudeSuggestsDegrees || spanX > 2 || spanY > 2;
}
function projectWgs84(poly) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of poly) {
        if (y < minY)
            minY = y;
        if (y > maxY)
            maxY = y;
    }
    const refLat = (minY + maxY) / 2;
    const cosRef = Math.cos((refLat * Math.PI) / 180) || 1;
    return poly.map(([lon, lat]) => [lon * cosRef, lat]);
}
function projectMercator(poly) {
    return poly.map(([lon, lat]) => {
        const clampedLat = clamp(lat, -85.05112878, 85.05112878);
        const latRad = (clampedLat * Math.PI) / 180;
        return [lon, Math.log(Math.tan(Math.PI / 4 + latRad / 2))];
    });
}
function normaliseWithCoordinateSystem(poly, coordinateSystem = 'auto') {
    const resolved = coordinateSystem === 'auto'
        ? (isLikelyLonLat(poly) ? 'wgs84' : 'planar')
        : coordinateSystem;
    switch (resolved) {
        case 'planar':
            return normalisePolygon(poly);
        case 'wgs84': {
            const normalized = normalisePolygon(projectWgs84(poly));
            // Flip Y for geographic coords (latitude increases north, screen Y increases down)
            return normalized.map(([x, y]) => [x, 1 - y]);
        }
        case 'mercator': {
            const normalized = normalisePolygon(projectMercator(poly));
            // Flip Y for geographic coords (latitude increases north, screen Y increases down)
            return normalized.map(([x, y]) => [x, 1 - y]);
        }
    }
}
// ─── SVG path parser (M/L/Z subset, absolute coords only) ────────────────────
export function parseSvgPath(d) {
    const points = [];
    const tokens = d.trim().split(/[\s,]+|(?=[MLZmlz])/);
    let cx = 0, cy = 0;
    for (let i = 0; i < tokens.length;) {
        const cmd = tokens[i++];
        if (!cmd)
            continue;
        if (cmd === 'M' || cmd === 'L') {
            const x = parseFloat(tokens[i++]);
            const y = parseFloat(tokens[i++]);
            cx = x;
            cy = y;
            points.push([x, y]);
        }
        else if (cmd === 'm' || cmd === 'l') {
            const dx = parseFloat(tokens[i++]);
            const dy = parseFloat(tokens[i++]);
            cx += dx;
            cy += dy;
            points.push([cx, cy]);
        }
        else if (cmd === 'Z' || cmd === 'z') {
            // close path — no new point needed
        }
        else {
            // skip unknown token
        }
    }
    const valid = points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (valid.length < 3) {
        throw new Error('SVG path has fewer than 3 valid points; expected an M/L closed path');
    }
    return normalisePolygon(valid);
}
// ─── GeoJSON polygon ─────────────────────────────────────────────────────────
export function parseGeoJsonPolygon(coords, coordinateSystem = 'auto') {
    return normaliseWithCoordinateSystem(coords, coordinateSystem);
}
export function loadBoundary(src) {
    switch (src.type) {
        case 'preset': {
            const p = PRESETS[src.name];
            if (!p)
                throw new Error(`Unknown preset: ${src.name}. Available: ${Object.keys(PRESETS).join(', ')}`);
            return p;
        }
        case 'polygon':
            return normaliseWithCoordinateSystem(src.points, src.coordinateSystem);
        case 'svgPath':
            return parseSvgPath(src.d);
        case 'geojson':
            return parseGeoJsonPolygon(src.coordinates, src.coordinateSystem);
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
export function pointInPolygon(px, py, poly) {
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
export function cellCoverage(cx, cy, halfW, halfH, poly, samples = 3) {
    let hits = 0;
    const total = samples * samples;
    for (let si = 0; si < samples; si++) {
        for (let sj = 0; sj < samples; sj++) {
            const px = cx - halfW + (halfW * 2 * (si + 0.5)) / samples;
            const py = cy - halfH + (halfH * 2 * (sj + 0.5)) / samples;
            if (pointInPolygon(px, py, poly))
                hits++;
        }
    }
    return hits / total;
}
/** Polygon bounding box */
export function boundingBox(poly) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (y < minY)
            minY = y;
        if (y > maxY)
            maxY = y;
    }
    return { minX, minY, maxX, maxY };
}
/** Signed area of polygon */
export function polygonArea(poly) {
    let area = 0;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        area += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
    }
    return Math.abs(area) / 2;
}
// ─── File loading helpers ─────────────────────────────────────────────────────
/** Keep only finite [lon, lat] pairs and thin the ring to at most 150 points
 *  so grid fitting stays fast on large GeoJSON/SVG files. */
function sanitiseRing(coords) {
    const valid = coords.filter(c => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]));
    if (valid.length > 150) {
        const step = Math.ceil(valid.length / 150);
        return valid.filter((_, i) => i % step === 0 || i === valid.length - 1);
    }
    return valid;
}
/**
 * Parse GeoJSON content and extract the first polygon
 */
export function parseGeoJsonFile(content, coordinateSystem = 'auto') {
    const data = JSON.parse(content);
    let coordinates;
    if (data.type === 'Polygon') {
        coordinates = data.coordinates[0]; // First ring (exterior)
    }
    else if (data.type === 'Feature' && data.geometry?.type === 'Polygon') {
        coordinates = data.geometry.coordinates[0];
    }
    else if (data.type === 'FeatureCollection' && data.features?.length > 0) {
        const firstPolygon = data.features.find((f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon');
        if (firstPolygon?.geometry?.type === 'Polygon') {
            coordinates = firstPolygon.geometry.coordinates[0];
        }
        else if (firstPolygon?.geometry?.type === 'MultiPolygon') {
            // Use the largest polygon from MultiPolygon
            const rings = firstPolygon.geometry.coordinates;
            let largestRing = rings[0][0];
            let largestArea = 0;
            for (const poly of rings) {
                const ring = poly[0];
                const area = Math.abs(polygonArea(ring));
                if (area > largestArea) {
                    largestArea = area;
                    largestRing = ring;
                }
            }
            coordinates = largestRing;
        }
    }
    else if (data.type === 'MultiPolygon') {
        // Use the largest polygon
        let largestRing = data.coordinates[0][0];
        let largestArea = 0;
        for (const poly of data.coordinates) {
            const ring = poly[0];
            const area = Math.abs(polygonArea(ring));
            if (area > largestArea) {
                largestArea = area;
                largestRing = ring;
            }
        }
        coordinates = largestRing;
    }
    coordinates = sanitiseRing(coordinates ?? []);
    if (coordinates.length < 3) {
        throw new Error('Could not extract polygon coordinates from GeoJSON');
    }
    return normaliseWithCoordinateSystem(coordinates, coordinateSystem);
}
/**
 * Parse SVG file content and extract the first path as a polygon
 */
export function parseSvgFile(content) {
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
        const polygon = [];
        for (let i = 0; i < points.length; i += 2) {
            polygon.push([points[i], points[i + 1]]);
        }
        const valid = sanitiseRing(polygon);
        if (valid.length < 3) {
            throw new Error('SVG polygon has fewer than 3 valid points');
        }
        return normalisePolygon(valid);
    }
    throw new Error('Could not extract polygon from SVG. Expected <path> or <polygon> element.');
}
/**
 * Load boundary from file content (for use in browser or after file read)
 */
export function loadBoundaryFromContent(content, format, coordinateSystem = 'auto') {
    if (format === 'geojson') {
        return parseGeoJsonFile(content, coordinateSystem);
    }
    else {
        return parseSvgFile(content);
    }
}
// Re-export for convenience
export { getCountryPolygon, isValidCountryCode, getCountryList, searchCountries } from './countries.js';
//# sourceMappingURL=boundary.js.map