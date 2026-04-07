// ══════════════════════════════════════════════════════════════════════════════
// Shared TypeScript types for Shapegrid
// ══════════════════════════════════════════════════════════════════════════════

export type Point2D = [number, number];

export type CoordSystem = 'auto' | 'planar' | 'wgs84' | 'mercator';

export type GridType = 'square' | 'hex';

export type BoundaryType = 'preset' | 'country' | 'file';

export type DaysMode = 'last' | 'years' | 'range';

export type CoordAxesPosition = 'outside' | 'inside';

export interface Cell {
  cx: number;
  cy: number;
  col: number;
  row: number;
  coverage: number;
}

export interface CellData {
  date: string;
  count: number;
  intensity: number;
}

export interface Grid {
  cells: Cell[];
  cellSize: number;
  gridType: GridType;
}

export interface GeoBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

export interface CountryData {
  name: string;
  coords: Point2D[];
}

export interface Palette {
  name: string;
  colors: string[];
}

export interface GitHubDay {
  date: string;
  contributionCount: number;
  color: string;
  weekday: number;
}

export interface GitHubContributions {
  username: string;
  total: number;
  days: GitHubDay[];
}

export interface ParsedFile {
  poly: Point2D[];
  geoBounds: GeoBounds | null;
  coordSystem: CoordSystem;
}

export interface GridOptions {
  count: number;
  type: GridType;
  thr?: number;
}

export interface GridResult {
  cells: Cell[];
  cellSize: number;
  gridType: GridType;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface AppState {
  poly: Point2D[];
  preset: string;
  country: string | null;
  boundaryType: BoundaryType;
  fileContent: string | null;
  fileName: string | null;
  fileType: 'svg' | 'geojson' | null;
  geoBounds: GeoBounds | null;
  coordSystem: CoordSystem | null;
  gridType: GridType;
  count: number;
  gap: number;
  coverage: number;
  showBoundary: boolean;
  showCoordAxes: boolean;
  coordAxesScale: number;
  coordAxesPosition: CoordAxesPosition;
  coordAxesOffset: number;
  coordAxesXOffset: number;       // X axis offset: positive = outside, negative = inside
  coordAxesYOffset: number;       // Y axis offset: positive = outside, negative = inside
  coordAxesTickLength: number;
  coordAxesLabelOffset: number;
  coordAxesLineColor: string;
  coordAxesLabelColor: string;
  yaw: number;
  pitch: number;
  heightScale: number;
  background: string;
  daysMode: DaysMode;
  selectedYears: Set<number>;
  contributions: GitHubContributions | null;
  grid: GridResult | null;
  cellData: CellData[];
}
