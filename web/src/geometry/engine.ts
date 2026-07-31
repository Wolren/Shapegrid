// ══════════════════════════════════════════════════════════════════════════════
// Core geometry engine - grid generation algorithms
// ══════════════════════════════════════════════════════════════════════════════

import type { Point2D, BoundingBox, Cell, GridType, GridResult, GridOptions } from '../types';

export function pip(px: number, py: number, poly: Point2D[]): boolean {
  let inside = false, n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Flat-array point-in-polygon: no per-vertex array destructuring, used by the
// hot grid-generation loops.
function pipFlat(px: number, py: number, xs: Float64Array, ys: Float64Array, n: number): boolean {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = xs[i], yi = ys[i], xj = xs[j], yj = ys[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when every edge turn shares an orientation (collinear runs tolerated). */
export function isConvexPolygon(poly: Point2D[]): boolean {
  const n = poly.length;
  if (n < 4) return true;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    const [cx, cy] = poly[(i + 2) % n];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-12) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

interface CovCtx {
  xs: Float64Array;
  ys: Float64Array;
  n: number;
}

function covCtx(poly: Point2D[]): CovCtx {
  const n = poly.length;
  const xs = new Float64Array(n), ys = new Float64Array(n);
  for (let i = 0; i < n; i++) { xs[i] = poly[i][0]; ys[i] = poly[i][1]; }
  return { xs, ys, n };
}

// Coverage of a cell bbox over the polygon. With minCov set, returns the
// moment the outcome is decided: hits only grow, so once hits/total >= minCov
// the result is guaranteed (returns minCov), and once even all remaining
// samples cannot reach minCov the result is guaranteed to fail (returns the
// current fraction). Both compare correctly against minCov.
function cellCovCtx(cx: number, cy: number, hw: number, hh: number, ctx: CovCtx, s = 4, minCov?: number): number {
  const { xs, ys, n } = ctx;
  const total = s * s;
  let hits = 0;
  for (let si = 0; si < s; si++) {
    for (let sj = 0; sj < s; sj++) {
      const px = cx - hw + (hw * 2 * (si + .5)) / s, py = cy - hh + (hh * 2 * (sj + .5)) / s;
      if (pipFlat(px, py, xs, ys, n)) hits++;
    }
    if (minCov !== undefined) {
      const done = (si + 1) * s;
      if (hits / total >= minCov) return minCov;
      if ((hits + (total - done)) / total < minCov) return hits / total;
    }
  }
  return hits / total;
}

export function cellCov(cx: number, cy: number, hw: number, hh: number, poly: Point2D[], s = 4, minCov?: number): number {
  return cellCovCtx(cx, cy, hw, hh, covCtx(poly), s, minCov);
}

// Convex fast path: when every bbox corner is inside a convex polygon, the
// whole cell is inside → coverage 1 exactly. Returns 1 when certain, null
// when the cell straddles the boundary and sampling is required.
function convexCellCov(cx: number, cy: number, hw: number, hh: number, ctx: CovCtx): number | null {
  const { xs, ys, n } = ctx;
  const x0 = cx - hw, x1 = cx + hw, y0 = cy - hh, y1 = cy + hh;
  if (pipFlat(x0, y0, xs, ys, n) && pipFlat(x1, y0, xs, ys, n) && pipFlat(x1, y1, xs, ys, n) && pipFlat(x0, y1, xs, ys, n)) {
    return 1;
  }
  return null;
}

export function bbox(poly: Point2D[]): BoundingBox {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function polyArea(poly: Point2D[]): number {
  let a = 0, n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a) / 2;
}

export function genSquare(poly: Point2D[], cs: number, thr = 0.3, maxCount?: number): Cell[] {
  const { minX, minY, maxX, maxY } = bbox(poly), h = cs / 2, cells: Cell[] = [];
  const ctx = covCtx(poly);
  const convex = isConvexPolygon(poly);
  const minCov = maxCount !== undefined ? thr : undefined;
  const cols = Math.ceil((maxX - minX) / cs) + 2, rows = Math.ceil((maxY - minY) / cs) + 2;
  for (let col = -1; col < cols; col++)
    for (let row = -1; row < rows; row++) {
      const cx = minX + (col + .5) * cs, cy = minY + (row + .5) * cs;
      let cov: number;
      if (convex) {
        const c = convexCellCov(cx, cy, h, h, ctx);
        cov = c !== null ? c : cellCovCtx(cx, cy, h, h, ctx, 4, minCov);
      } else {
        cov = cellCovCtx(cx, cy, h, h, ctx, 4, minCov);
      }
      if (cov >= thr) {
        cells.push({ cx, cy, col, row, coverage: cov });
        // Early exit: callers that only need to know "does this grid reach N
        // cells?" (findSize binary search) can stop the moment we hit N —
        // no need to scan the rest of the candidate grid.
        if (maxCount !== undefined && cells.length >= maxCount) return cells;
      }
    }
  return cells;
}

export function genHex(poly: Point2D[], cs: number, thr = 0.3, maxCount?: number): Cell[] {
  const { minX, minY, maxX, maxY } = bbox(poly);
  const hw = cs / 2, hh = cs * Math.sqrt(3) / 2, cells: Cell[] = [];
  const ctx = covCtx(poly);
  const convex = isConvexPolygon(poly);
  const minCov = maxCount !== undefined ? thr : undefined;
  // Hex tiling matching the actual web renderer (app.ts buildMesh):
  // THREE.CylinderGeometry(r, r, 1, 6) with r = cellSize / √3 * (1 - gap), so
  // at gap = 0 the circumradius is R = cs / √3. CylinderGeometry places radial
  // vertices at (r·sin θ, r·cos θ) → vertices at ±Z, edges at ±X. Touching
  // neighbors therefore sit at (±cs, 0) [east-west] and (±cs/2, ±√3·cs/2)
  // [diagonal rows]. So: column step = cs, row step = √3·cs/2, odd rows
  // offset by cs/2.
  const xStep = cs;
  const zStep = cs * Math.sqrt(3) / 2;
  const cols = Math.ceil((maxX - minX) / xStep) + 3, rows = Math.ceil((maxY - minY) / zStep) + 3;
  for (let col = -1; col < cols; col++)
    for (let row = -1; row < rows; row++) {
      const cx = minX + (col + (row & 1) * 0.5) * xStep;
      const cy = minY + row * zStep;
      let cov: number;
      if (convex) {
        const c = convexCellCov(cx, cy, hw, hh, ctx);
        cov = c !== null ? c : cellCovCtx(cx, cy, hw, hh, ctx, 4, minCov);
      } else {
        cov = cellCovCtx(cx, cy, hw, hh, ctx, 4, minCov);
      }
      if (cov >= thr) {
        cells.push({ cx, cy, col, row, coverage: cov });
        if (maxCount !== undefined && cells.length >= maxCount) return cells;
      }
    }
  return cells;
}

export function countCells(poly: Point2D[], cs: number, type: GridType, thr = 0.3, maxCount?: number): number {
  return (type === 'square' ? genSquare : genHex)(poly, cs, thr, maxCount).length;
}

export function findSize(poly: Point2D[], N: number, type: GridType, thr = 0.3): number {
  const area = polyArea(poly);
  if (!Number.isFinite(area) || area <= 0) {
    throw new Error('Boundary polygon has zero or invalid area; cannot fit a grid');
  }
  if (!Number.isFinite(N) || N < 1) {
    throw new Error(`Invalid cell count: ${N}; expected a positive number`);
  }
  let lo = Math.sqrt(area / N) * .05, hi = Math.sqrt(area) * 3;
  // Pass N as maxCount: the binary search only needs to know whether a
  // candidate cell size reaches N cells, so countCells can stop generating
  // the moment it hits N instead of scanning the whole candidate grid.
  for (let i = 0; i < 20; i++) { if (countCells(poly, hi, type, thr, N) < N) break; hi *= 2; }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (hi - lo < 1e-9) break;
    countCells(poly, mid, type, thr, N) >= N ? lo = mid : hi = mid;
  }
  return lo;
}

export function generateGrid(poly: Point2D[], opts: GridOptions): GridResult {
  const { count, type, thr = 0.3 } = opts;
  const cs = findSize(poly, count, type, thr);
  const cands = (type === 'square' ? genSquare : genHex)(poly, cs, thr);
  // Nothing survived the coverage threshold — return an empty grid rather than
  // producing NaN centroids below.
  if (cands.length === 0) {
    return { cells: [], cellSize: cs, gridType: type };
  }
  const cx0 = cands.reduce((s, c) => s + c.cx, 0) / cands.length;
  const cy0 = cands.reduce((s, c) => s + c.cy, 0) / cands.length;
  const ranked = cands.slice().sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    return ((a.cx - cx0) ** 2 + (a.cy - cy0) ** 2) - ((b.cx - cx0) ** 2 + (b.cy - cy0) ** 2);
  }).slice(0, count);
  ranked.sort((a, b) => { const d = Math.round((a.cy - b.cy) / (cs * 0.75)); return d || a.cx - b.cx; });
  return { cells: ranked, cellSize: cs, gridType: type };
}
