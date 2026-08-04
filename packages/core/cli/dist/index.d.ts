#!/usr/bin/env node
/**
 * shapegrid CLI
 *
 * Usage:
 *   shapegrid generate --config shapegrid.config.yml
 *   shapegrid generate --user octocat --token ghp_xxx --count 365
 *   shapegrid preview --config shapegrid.config.yml   # open browser preview
 */
import { type BoundarySource, type GridType, type ColorScale } from '@shapegrid/core';
export interface ShapegridConfig {
    github: {
        username: string;
        token: string;
    };
    boundary: BoundarySource;
    grid: {
        type: GridType;
        count: number;
        coverageThreshold?: number;
    };
    camera: {
        yaw: number;
        pitch: number;
        zoom?: number;
    };
    theme?: {
        palette?: string;
        customPalette?: {
            name: string;
            colors: string[];
        };
        /** Border color for empty days (no fill). Use on light backgrounds. */
        dayBorder?: string;
    };
    axes?: {
        enabled?: boolean;
        position?: 'outside' | 'inside';
        distance?: number;
        lineColor?: string;
        labelColor?: string;
        labelFont?: string;
        labelScale?: number;
    };
    render: {
        colorScale: ColorScale;
        heightScale: number;
        showBoundary: boolean;
        background: string;
        gap: number;
        /** Intensity scale mode: linear | sqrt | cbrt | log (default linear) */
        scaleMode?: 'linear' | 'sqrt' | 'cbrt' | 'log';
    };
    /** Post-processing effects, mirrored into the data export so the web
     * viewer applies them when rendering the profile PNG (bloom etc.). */
    effects?: {
        bloomEnabled?: boolean;
        bloomStrength?: number;
        bloomRadius?: number;
        bloomThreshold?: number;
        fogEnabled?: boolean;
        fogDensity?: number;
        toneMapping?: number;
        envMapEnabled?: boolean;
        rayTracingEnabled?: boolean;
        rayTracingSamples?: number;
        rayTracingBounces?: number;
    };
    output: {
        dir: string;
        svgFilename?: string;
        pngFilename?: string;
        jsonFilename?: string;
        width: number;
        height: number;
        /** Commit generated assets back to git repo */
        autoCommit?: boolean;
    };
    dateRange?: {
        last?: number;
        start?: string;
        end?: string;
    };
    /** Dashboard overlay widgets, mirroring the web viewer's export format. */
    dashboard?: {
        widgets?: DashboardWidgetConfig[];
        collapsed?: boolean;
        layout?: 'floating' | 'grid';
    };
}
/** Widget config as exported by the web viewer (config.dashboard.widgets). */
export interface DashboardWidgetConfig {
    id: string;
    title?: string;
    visible?: boolean;
    position?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'left' | 'right';
    order?: number;
    settings?: Record<string, any>;
    customPos?: {
        x: number;
        y: number;
    } | null;
}
//# sourceMappingURL=index.d.ts.map