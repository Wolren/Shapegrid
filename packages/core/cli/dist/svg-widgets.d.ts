import type { DashboardWidgetConfig } from './index.js';
import type { DataExport } from './svg-render.js';
/** GitHub-style lightness ramp built from a widget accent (mirror accentRamp). */
export declare function accentRamp(accent: string, steps?: number): string[];
/**
 * Render all visible, supported dashboard widgets as SVG groups. Widgets with
 * unsupported ids (not ported to SVG) are skipped silently. Empty string when
 * the dashboard section is absent or no widget is visible/supported.
 */
export declare function renderDashboardWidgets(data: DataExport, widgets: DashboardWidgetConfig[] | undefined, W: number, H: number): {
    svg: string;
    bbox: {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    } | null;
};
//# sourceMappingURL=svg-widgets.d.ts.map