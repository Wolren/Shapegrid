/**
 * grid.ts
 * Generates square or hexagonal grids inside a polygon boundary,
 * fitting EXACTLY the requested number of cells via binary search.
 */

import {
  type Polygon,
  type Point,
  boundingBox,
  polygonArea,
  pointInPolygon,
  cellCoverage,
  isConvexPolygon,
} from './boundary.js';

export type GridType = 'square' | 'hex';

export interface Cell {
  /** Centre point in normalised [0,1] space */
  cx: number;
  cy: number;
  /** Column and row indices in the underlying lattice */
  col: number;
  row: number;
  /** Coverage fraction [0,1] — 1 means fully inside polygon */
  coverage: number;
}

export interface GridResult {
  cells: Cell[];
  /** Side length of each cell in normalised coordinates */
  cellSize: number;
  gridType: GridType;
}

// ─── Candidate generation ────────────────────────────────────────────────────

export interface CandidateOptions {
  /** Stop collecting once this many qualifying cells are found (binary-search counting). */
  maxCount?: number;
  /** Polygon is convex; enables the cellCoverage bbox fast path. */
  convex?: boolean;
  /**
   * Counting mode: coverage tests early-exit once the threshold is reached,
   * so binary-search iterations never pay for full 9-sample coverage.
   */
  countMode?: boolean;
}

function generateSquareCandidates(
  poly: Polygon,
  cellSize: number,
  coverageThreshold = 0.4,
  opts: CandidateOptions = {}
): Cell[] {
  const { maxCount = Infinity, convex = false, countMode = false } = opts;
  const { minX, minY, maxX, maxY } = boundingBox(poly);
  const half = cellSize / 2;
  const cells: Cell[] = [];

  const cols = Math.ceil((maxX - minX) / cellSize) + 2;
  const rows = Math.ceil((maxY - minY) / cellSize) + 2;

  for (let col = -1; col < cols; col++) {
    for (let row = -1; row < rows; row++) {
      const cx = minX + (col + 0.5) * cellSize;
      const cy = minY + (row + 0.5) * cellSize;
      const cov = cellCoverage(cx, cy, half, half, poly, 3, {
        convex,
        minCoverage: countMode ? coverageThreshold : 0,
      });
      if (cov >= coverageThreshold) {
        cells.push({ cx, cy, col, row, coverage: cov });
        if (cells.length >= maxCount) return cells;
      }
    }
  }
  return cells;
}

function generateHexCandidates(
  poly: Polygon,
  cellSize: number,
  coverageThreshold = 0.4,
  opts: CandidateOptions = {}
): Cell[] {
  const { maxCount = Infinity, convex = false, countMode = false } = opts;
  const { minX, minY, maxX, maxY } = boundingBox(poly);

  // Pointy-top hex (vertices at top/bottom — the SVG renderer draws corners at
  // halfSize = cellSize / 2, i.e. circumradius R = cellSize / 2). For touching
  // neighbors: east-west step = √3R, row step = 1.5R, odd rows offset by √3R/2.
  const R = cellSize / 2;
  const xStep = R * Math.sqrt(3);   // ≈ 0.866 · cellSize
  const yStep = R * 1.5;            // = 0.75 · cellSize
  const halfW = R * Math.sqrt(3) / 2;
  const halfH = R;
  const cells: Cell[] = [];

  const cols = Math.ceil((maxX - minX) / xStep) + 3;
  const rows = Math.ceil((maxY - minY) / yStep) + 3;

  for (let col = -1; col < cols; col++) {
    for (let row = -1; row < rows; row++) {
      const cx = minX + (col + (row & 1) * 0.5) * xStep;
      const cy = minY + row * yStep;
      const cov = cellCoverage(cx, cy, halfW, halfH, poly, 3, {
        convex,
        minCoverage: countMode ? coverageThreshold : 0,
      });
      if (cov >= coverageThreshold) {
        cells.push({ cx, cy, col, row, coverage: cov });
        if (cells.length >= maxCount) return cells;
      }
    }
  }
  return cells;
}

// ─── Count cells at a given size ─────────────────────────────────────────────

function countCells(
  poly: Polygon,
  cellSize: number,
  type: GridType,
  coverageThreshold = 0.4,
  maxCount = Infinity,
  convex = false
): number {
  const opts: CandidateOptions = { maxCount, convex, countMode: true };
  if (type === 'square') return generateSquareCandidates(poly, cellSize, coverageThreshold, opts).length;
  return generateHexCandidates(poly, cellSize, coverageThreshold, opts).length;
}

// ─── Binary search for cell size that yields >= N cells ──────────────────────

function findCellSize(
  poly: Polygon,
  targetN: number,
  type: GridType,
  coverageThreshold = 0.4
): number {
  const area = polygonArea(poly);
  if (!Number.isFinite(area) || area <= 0) {
    throw new Error('Boundary polygon has zero or invalid area; cannot fit a grid');
  }
  if (!Number.isFinite(targetN) || targetN < 1) {
    throw new Error(`Invalid cell count: ${targetN}; expected a positive number`);
  }

  // Convex boundaries enable the whole-cell bbox fast path in cellCoverage.
  const convex = isConvexPolygon(poly);

  // Initial guess from area
  const areaPerCell = area / targetN;
  let lo = Math.sqrt(areaPerCell) * 0.1;
  let hi = Math.sqrt(area) * 2;

  // Ensure hi gives fewer than N cells (early-exit counting caps at targetN)
  for (let i = 0; i < 20; i++) {
    if (countCells(poly, hi, type, coverageThreshold, targetN, convex) < targetN) break;
    hi *= 2;
  }

  // Binary search: find smallest cellSize where count < targetN
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (hi - lo < 1e-8) break;
    const n = countCells(poly, mid, type, coverageThreshold, targetN, convex);
    if (n >= targetN) {
      lo = mid; // can still fit N, try larger cells
    } else {
      hi = mid; // too few cells, shrink
    }
  }

  // lo is the largest size where we get >= N cells
  return lo;
}

// ─── Cell ranking & selection ─────────────────────────────────────────────────

/**
 * Pick exactly N cells from candidates.
 * Priority: coverage desc, then distance from centroid asc.
 */
function selectN(cells: Cell[], n: number, poly: Polygon): Cell[] {
  if (cells.length <= n) return cells;

  // Compute centroid
  const cx = cells.reduce((s, c) => s + c.cx, 0) / cells.length;
  const cy = cells.reduce((s, c) => s + c.cy, 0) / cells.length;

  // Sort: full coverage first, then closest to centroid
  const ranked = cells.slice().sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    const da = (a.cx - cx) ** 2 + (a.cy - cy) ** 2;
    const db = (b.cx - cx) ** 2 + (b.cy - cy) ** 2;
    return da - db;
  });
  return ranked.slice(0, n);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GridOptions {
  /** Exact number of cells to place */
  count: number;
  type: GridType;
  /**
   * Minimum coverage fraction for a cell to be included (0–1).
   * Lower values allow partial border cells. Default 0.4.
   */
  coverageThreshold?: number;
}

/**
 * Generate a grid of exactly `count` cells inside `poly`.
 */
export function generateGrid(poly: Polygon, opts: GridOptions): GridResult {
  const { count, type, coverageThreshold = 0.4 } = opts;

  const cellSize = findCellSize(poly, count, type, coverageThreshold);

  const convex = isConvexPolygon(poly);
  const candidates =
    type === 'square'
      ? generateSquareCandidates(poly, cellSize, coverageThreshold, { convex })
      : generateHexCandidates(poly, cellSize, coverageThreshold, { convex });

  // Nothing survived the coverage threshold — return an empty grid rather than
  // producing NaN centroids in selectN.
  if (candidates.length === 0) {
    return { cells: [], cellSize, gridType: type };
  }

  const cells = selectN(candidates, count, poly);

  // Sort cells in reading order (top-to-bottom, left-to-right) for
  // deterministic day assignment
  cells.sort((a, b) => {
    const rowDiff = Math.round((a.cy - b.cy) / (cellSize * 0.5));
    return rowDiff !== 0 ? rowDiff : a.cx - b.cx;
  });

  return { cells, cellSize, gridType: type };
}

// ─── Day-range helpers ────────────────────────────────────────────────────────

export interface DayRange {
  start: Date;
  end: Date;
}

/** Return an array of Date objects for each day in the range */
export function daysInRange({ start, end }: DayRange): Date[] {
  const days: Date[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endMs = new Date(end).setHours(0, 0, 0, 0);
  while (cur.getTime() <= endMs) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** Last N days ending today */
export function lastNDays(n: number): DayRange {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - n + 1);
  return { start, end };
}
