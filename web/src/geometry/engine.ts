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

export function cellCov(cx: number, cy: number, hw: number, hh: number, poly: Point2D[], s = 4): number {
  let hits = 0;
  for (let si = 0; si < s; si++)
    for (let sj = 0; sj < s; sj++) {
      const px = cx - hw + (hw * 2 * (si + .5)) / s, py = cy - hh + (hh * 2 * (sj + .5)) / s;
      if (pip(px, py, poly)) hits++;
    }
  return hits / (s * s);
}

export function bbox(poly: Point2D[]): BoundingBox {
  const xs = poly.map(([x]) => x), ys = poly.map(([,y]) => y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function polyArea(poly: Point2D[]): number {
  let a = 0, n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a) / 2;
}

export function genSquare(poly: Point2D[], cs: number, thr = 0.3): Cell[] {
  const { minX, minY, maxX, maxY } = bbox(poly), h = cs / 2, cells: Cell[] = [];
  const cols = Math.ceil((maxX - minX) / cs) + 2, rows = Math.ceil((maxY - minY) / cs) + 2;
  for (let col = -1; col < cols; col++)
    for (let row = -1; row < rows; row++) {
      const cx = minX + (col + .5) * cs, cy = minY + (row + .5) * cs;
      const cov = cellCov(cx, cy, h, h, poly);
      if (cov >= thr) cells.push({ cx, cy, col, row, coverage: cov });
    }
  return cells;
}

export function genHex(poly: Point2D[], cs: number, thr = 0.3): Cell[] {
  const { minX, minY, maxX, maxY } = bbox(poly);
  const hw = cs / 2, hh = cs * Math.sqrt(3) / 2, cells: Cell[] = [];
  const cols = Math.ceil((maxX - minX) / (cs * .75)) + 3, rows = Math.ceil((maxY - minY) / (hh * 2)) + 3;
  for (let col = -1; col < cols; col++)
    for (let row = -1; row < rows; row++) {
      const cx = minX + col * cs * .75, cy = minY + (col % 2 === 0 ? row : row + .5) * hh * 2;
      const cov = cellCov(cx, cy, hw, hh, poly);
      if (cov >= thr) cells.push({ cx, cy, col, row, coverage: cov });
    }
  return cells;
}

export function countCells(poly: Point2D[], cs: number, type: GridType): number {
  return (type === 'square' ? genSquare : genHex)(poly, cs).length;
}

export function findSize(poly: Point2D[], N: number, type: GridType): number {
  const area = polyArea(poly);
  let lo = Math.sqrt(area / N) * .05, hi = Math.sqrt(area) * 3;
  for (let i = 0; i < 20; i++) { if (countCells(poly, hi, type) < N) break; hi *= 2; }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (hi - lo < 1e-9) break;
    countCells(poly, mid, type) >= N ? lo = mid : hi = mid;
  }
  return lo;
}

export function generateGrid(poly: Point2D[], opts: GridOptions): GridResult {
  const { count, type, thr = 0.3 } = opts;
  const cs = findSize(poly, count, type);
  const cands = (type === 'square' ? genSquare : genHex)(poly, cs, thr);
  const cx0 = cands.reduce((s, c) => s + c.cx, 0) / cands.length;
  const cy0 = cands.reduce((s, c) => s + c.cy, 0) / cands.length;
  const ranked = cands.slice().sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    return ((a.cx - cx0) ** 2 + (a.cy - cy0) ** 2) - ((b.cx - cx0) ** 2 + (b.cy - cy0) ** 2);
  }).slice(0, count);
  ranked.sort((a, b) => { const d = Math.round((a.cy - b.cy) / (cs * .5)); return d || a.cx - b.cx; });
  return { cells: ranked, cellSize: cs, gridType: type };
}
