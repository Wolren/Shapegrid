/**
 * render-png.ts
 * Headless Three.js PNG renderer — produces pixel-identical output
 * to the interactive web viewer using software WebGL (gl).
 */
export interface PngRenderOptions {
    /** Path to the DataExport JSON file */
    dataPath: string;
    /** Output PNG path */
    outputPath: string;
    /** Image width in pixels */
    width: number;
    /** Image height in pixels */
    height: number;
}
/**
 * Render a shapegrid scene to PNG using headless WebGL.
 * The scene setup mirrors the interactive web viewer (app.ts) exactly.
 */
export declare function renderPng(opts: PngRenderOptions): void;
//# sourceMappingURL=render-png.d.ts.map