import type { ColorScale, GridType } from '@shapegrid/core';
import type { ShapegridConfig } from './index.js';
export interface DataExport {
    version: number;
    generated: string;
    username: string;
    totalContributions: number;
    grid: {
        type: GridType;
        count: number;
        cellSize: number;
        cells: {
            cx: number;
            cy: number;
            date: string;
            count: number;
            intensity: number;
        }[];
    };
    boundary: [number, number][];
    /** Chronological daily contribution series (for timeline/streak widgets). */
    days?: {
        date: string;
        contributionCount: number;
    }[];
    /** Aggregated language percentages (for the languages widget). */
    languages?: {
        name: string;
        color: string;
        percentage: number;
    }[];
    geoBounds?: {
        minLon: number;
        maxLon: number;
        minLat: number;
        maxLat: number;
    };
    coordSystem?: 'planar' | 'wgs84' | 'mercator';
    config: Pick<ShapegridConfig, 'camera' | 'render' | 'theme' | 'dashboard'>;
}
export declare function generateSvg(data: DataExport, cfg: ShapegridConfig): string;
export declare function generateLegend(colorScale: ColorScale, W: number, H: number): string;
export declare function generateCoordAxes(data: DataExport, cfg: ShapegridConfig, minX: number, maxX: number, minY: number, maxY: number, W: number, H: number, zoom: number, ISO_YAW: number, ISO_PITCH: number): string;
/** "x,y x,y ..." for a closed polygon (no intermediate array allocations). */
export declare function polyPoints(pts: Array<[number, number]>): string;
/** "x,y" for a single projected point. */
export declare function fmt(p: [number, number]): string;
export declare function darkenColor(hex: string, factor: number): string;
export declare function lightenColor(hex: string, factor: number): string;
export declare function hexToRgb(hex: string): {
    r: number;
    g: number;
    b: number;
} | null;
export declare function getDateRange(data: DataExport): string;
//# sourceMappingURL=svg-render.d.ts.map