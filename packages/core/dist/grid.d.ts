/**
 * grid.ts
 * Generates square or hexagonal grids inside a polygon boundary,
 * fitting EXACTLY the requested number of cells via binary search.
 */
import { type Polygon } from './boundary.js';
export type GridType = 'square' | 'hex';
export interface Cell {
    /** Centre point in normalised [0,1] space */
    cx: number;
    cy: number;
    /** Column and row indices in the underlying lattice */
    col: number;
    row: number;
    /** Coverage fraction [0,1] - 1 means fully inside polygon */
    coverage: number;
}
export interface GridResult {
    cells: Cell[];
    /** Side length of each cell in normalised coordinates */
    cellSize: number;
    gridType: GridType;
}
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
export declare function generateGrid(poly: Polygon, opts: GridOptions): GridResult;
export interface DayRange {
    start: Date;
    end: Date;
}
/** Return an array of Date objects for each day in the range */
export declare function daysInRange({ start, end }: DayRange): Date[];
/** Last N days ending today */
export declare function lastNDays(n: number): DayRange;
//# sourceMappingURL=grid.d.ts.map