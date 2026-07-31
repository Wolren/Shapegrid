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
  continent: string;
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

export interface OverlayPos {
  x: number;  // % from left
  y: number;  // % from top
}

export interface OverlayState {
  legendPos: OverlayPos;
  statsPos: OverlayPos;
  showLegend: boolean;
  showStats: boolean;
  legendFontSize: number;
  legendBarWidth: number;
  statsFontSize: number;
  statsInline: boolean;
}

// ══════════════════════════════════════════════════════════════════════════════
// Dashboard widget system — GIS display widgets
// ══════════════════════════════════════════════════════════════════════════════

export type WidgetId = 'legend' | 'stats' | 'languages' | 'cellInfo' | 'scaleBar' | 'coordinates' | 'distribution' | 'timeline' | 'activity' | 'topCells' | 'weekday' | 'streak' | 'monthly' | 'geo' | 'minimap';

export interface WidgetConfig {
  id: WidgetId;
  title: string;
  visible: boolean;
  position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'left' | 'right';
  order: number;
  settings: Record<string, any>;
  customPos: { x: number; y: number } | null;
}

export interface DashboardState {
  widgets: WidgetConfig[];
  collapsed: boolean;
  managerOpen: boolean;
  layout: 'floating' | 'grid';
}

export interface GitHubLanguage {
  name: string;
  color: string;
  size: number;
  percentage: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// Editor / GIS tool types
// ══════════════════════════════════════════════════════════════════════════════

export type ToolType = 'select' | 'pan' | 'measureDistance' | 'measureArea';

export interface Measurement {
  id: string;
  type: 'distance' | 'area';
  points: Point2D[];
  distance?: number;
  area?: number;
  label: string;
}

export interface LayerVisibility {
  boundary: boolean;
  grid: boolean;
  axes: boolean;
  overheadLabels: boolean;
}

export interface EditorState {
  activeTool: ToolType;
  selectedCellIndices: number[];
  measurements: Measurement[];
  activeMeasurement: Measurement | null;
  showInfoPanel: boolean;
  showDataTable: boolean;
  showLayerPanel: boolean;
  dataTableSort: { key: string; asc: boolean } | null;
  layerVisibility: LayerVisibility;
}

// ══════════════════════════════════════════════════════════════════════════════

export interface ThemeColors {
  accent: string;
  accent2: string;
  background: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  text: string;
  muted: string;
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
  coordAxesXOffset: number;
  coordAxesYOffset: number;
  coordAxesTickLength: number;
  coordAxesLabelOffset: number;
  coordAxesLineColor: string;
  coordAxesLabelColor: string;
  yaw: number;
  pitch: number;
  zoom: number;
  heightScale: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  bloomEnabled: boolean;
  fogEnabled: boolean;
  fogDensity: number;
  toneMapping: number;
  envMapEnabled: boolean;
  scaleMode: 'linear' | 'sqrt' | 'cbrt' | 'log';
  orgName: string;
  includeOrgRepos: boolean;
  background: string;
  palette: string;
  daysMode: DaysMode;
  selectedYears: Set<number>;
  contributions: GitHubContributions | null;
  grid: GridResult | null;
  cellData: CellData[];
  overlay: OverlayState;
  dashboard: DashboardState;
  languages: GitHubLanguage[];
  theme: ThemeColors;
  rayTracingEnabled: boolean;
  rayTracingSamples: number;
  rayTracingBounces: number;
}

/**
 * Shape of the JSON data file generated by the CLI / CI pipeline.
 */
export interface DataExportCell {
  cx: number;
  cy: number;
  date: string;
  count: number;
  intensity: number;
}

export interface DataExportGrid {
  type: GridType;
  count: number;
  cellSize: number;
  cells: DataExportCell[];
}

export interface DataExportCamera {
  yaw: number;
  pitch: number;
  zoom?: number;
}

export interface DataExportRender {
  heightScale: number;
  showBoundary: boolean;
  background: string;
  gap: number;
}

export interface DataExportTheme {
  palette?: string;
  dayBorder?: string;
  colors?: ThemeColors;
}

export interface DataExport {
  version: number;
  generated: string;
  username: string;
  totalContributions: number;
  grid: DataExportGrid;
  boundary: Point2D[];
  geoBounds?: GeoBounds;
  coordSystem?: 'planar' | 'wgs84' | 'mercator';
  config: {
    camera: DataExportCamera;
    render: DataExportRender;
    theme?: DataExportTheme;
  };
}
