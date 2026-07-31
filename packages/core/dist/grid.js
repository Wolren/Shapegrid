/**
 * grid.ts
 * Generates square or hexagonal grids inside a polygon boundary,
 * fitting EXACTLY the requested number of cells via binary search.
 */
import { boundingBox, polygonArea, cellCoverage, } from './boundary.js';
// ─── Candidate generation ────────────────────────────────────────────────────
function generateSquareCandidates(poly, cellSize, coverageThreshold = 0.4) {
    const { minX, minY, maxX, maxY } = boundingBox(poly);
    const half = cellSize / 2;
    const cells = [];
    const cols = Math.ceil((maxX - minX) / cellSize) + 2;
    const rows = Math.ceil((maxY - minY) / cellSize) + 2;
    for (let col = -1; col < cols; col++) {
        for (let row = -1; row < rows; row++) {
            const cx = minX + (col + 0.5) * cellSize;
            const cy = minY + (row + 0.5) * cellSize;
            const cov = cellCoverage(cx, cy, half, half, poly);
            if (cov >= coverageThreshold) {
                cells.push({ cx, cy, col, row, coverage: cov });
            }
        }
    }
    return cells;
}
function generateHexCandidates(poly, cellSize, coverageThreshold = 0.4) {
    const { minX, minY, maxX, maxY } = boundingBox(poly);
    // Pointy-top hex (vertices at top/bottom — the SVG renderer draws corners at
    // halfSize = cellSize / 2, i.e. circumradius R = cellSize / 2). For touching
    // neighbors: east-west step = √3R, row step = 1.5R, odd rows offset by √3R/2.
    const R = cellSize / 2;
    const xStep = R * Math.sqrt(3); // ≈ 0.866 · cellSize
    const yStep = R * 1.5; // = 0.75 · cellSize
    const halfW = R * Math.sqrt(3) / 2;
    const halfH = R;
    const cells = [];
    const cols = Math.ceil((maxX - minX) / xStep) + 3;
    const rows = Math.ceil((maxY - minY) / yStep) + 3;
    for (let col = -1; col < cols; col++) {
        for (let row = -1; row < rows; row++) {
            const cx = minX + (col + (row & 1) * 0.5) * xStep;
            const cy = minY + row * yStep;
            const cov = cellCoverage(cx, cy, halfW, halfH, poly);
            if (cov >= coverageThreshold) {
                cells.push({ cx, cy, col, row, coverage: cov });
            }
        }
    }
    return cells;
}
// ─── Count cells at a given size ─────────────────────────────────────────────
function countCells(poly, cellSize, type, coverageThreshold = 0.4) {
    if (type === 'square')
        return generateSquareCandidates(poly, cellSize, coverageThreshold).length;
    return generateHexCandidates(poly, cellSize, coverageThreshold).length;
}
// ─── Binary search for cell size that yields >= N cells ──────────────────────
function findCellSize(poly, targetN, type, coverageThreshold = 0.4) {
    const area = polygonArea(poly);
    if (!Number.isFinite(area) || area <= 0) {
        throw new Error('Boundary polygon has zero or invalid area; cannot fit a grid');
    }
    if (!Number.isFinite(targetN) || targetN < 1) {
        throw new Error(`Invalid cell count: ${targetN}; expected a positive number`);
    }
    // Initial guess from area
    const areaPerCell = area / targetN;
    let lo = Math.sqrt(areaPerCell) * 0.1;
    let hi = Math.sqrt(area) * 2;
    // Ensure hi gives fewer than N cells
    for (let i = 0; i < 20; i++) {
        if (countCells(poly, hi, type, coverageThreshold) < targetN)
            break;
        hi *= 2;
    }
    // Binary search: find smallest cellSize where count < targetN
    for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (hi - lo < 1e-8)
            break;
        const n = countCells(poly, mid, type, coverageThreshold);
        if (n >= targetN) {
            lo = mid; // can still fit N, try larger cells
        }
        else {
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
function selectN(cells, n, poly) {
    if (cells.length <= n)
        return cells;
    // Compute centroid
    const cx = cells.reduce((s, c) => s + c.cx, 0) / cells.length;
    const cy = cells.reduce((s, c) => s + c.cy, 0) / cells.length;
    // Sort: full coverage first, then closest to centroid
    const ranked = cells.slice().sort((a, b) => {
        if (b.coverage !== a.coverage)
            return b.coverage - a.coverage;
        const da = (a.cx - cx) ** 2 + (a.cy - cy) ** 2;
        const db = (b.cx - cx) ** 2 + (b.cy - cy) ** 2;
        return da - db;
    });
    return ranked.slice(0, n);
}
/**
 * Generate a grid of exactly `count` cells inside `poly`.
 */
export function generateGrid(poly, opts) {
    const { count, type, coverageThreshold = 0.4 } = opts;
    const cellSize = findCellSize(poly, count, type, coverageThreshold);
    const candidates = type === 'square'
        ? generateSquareCandidates(poly, cellSize, coverageThreshold)
        : generateHexCandidates(poly, cellSize, coverageThreshold);
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
/** Return an array of Date objects for each day in the range */
export function daysInRange({ start, end }) {
    const days = [];
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
export function lastNDays(n) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - n + 1);
    return { start, end };
}
//# sourceMappingURL=grid.js.map