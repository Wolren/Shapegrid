/**
 * boundary.ts
 * Parses and normalises polygon boundaries for grid fitting.
 * Supports: raw point arrays, SVG path strings, named presets, country codes, and files.
 */
export type Point = [number, number];
export type Polygon = Point[];
export type CoordinateSystem = 'auto' | 'planar' | 'wgs84' | 'mercator';
export declare const PRESETS: Record<string, Polygon>;
/** Translate + scale polygon so it fits in [0,1]×[0,1] */
export declare function normalisePolygon(poly: Polygon): Polygon;
export declare function parseSvgPath(d: string): Polygon;
export declare function parseGeoJsonPolygon(coords: [number, number][], coordinateSystem?: CoordinateSystem): Polygon;
export type BoundarySource = {
    type: 'preset';
    name: string;
} | {
    type: 'polygon';
    points: Point[];
    coordinateSystem?: CoordinateSystem;
} | {
    type: 'svgPath';
    d: string;
} | {
    type: 'geojson';
    coordinates: [number, number][];
    coordinateSystem?: CoordinateSystem;
} | {
    type: 'country';
    code: string;
} | {
    type: 'file';
    path: string;
    format?: 'geojson' | 'svg';
    coordinateSystem?: CoordinateSystem;
};
export declare function loadBoundary(src: BoundarySource): Polygon;
export declare function pointInPolygon(px: number, py: number, poly: Polygon): boolean;
/** Return fraction of a cell's sample points that are inside the polygon */
export declare function cellCoverage(cx: number, cy: number, halfW: number, halfH: number, poly: Polygon, samples?: number): number;
/** Polygon bounding box */
export declare function boundingBox(poly: Polygon): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};
/** Signed area of polygon */
export declare function polygonArea(poly: Polygon): number;
/**
 * Parse GeoJSON content and extract the first polygon
 */
export declare function parseGeoJsonFile(content: string, coordinateSystem?: CoordinateSystem): Polygon;
/**
 * Parse SVG file content and extract the first path as a polygon
 */
export declare function parseSvgFile(content: string): Polygon;
/**
 * Load boundary from file content (for use in browser or after file read)
 */
export declare function loadBoundaryFromContent(content: string, format: 'geojson' | 'svg', coordinateSystem?: CoordinateSystem): Polygon;
export { getCountryPolygon, isValidCountryCode, getCountryList, searchCountries } from './countries.js';
//# sourceMappingURL=boundary.d.ts.map