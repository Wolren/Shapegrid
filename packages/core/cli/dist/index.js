#!/usr/bin/env node
/**
 * shapegrid CLI
 *
 * Usage:
 *   shapegrid generate --config shapegrid.config.yml
 *   shapegrid generate --user octocat --token ghp_xxx --count 365
 *   shapegrid preview --config shapegrid.config.yml   # open browser preview
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadBoundary, loadBoundaryFromContent, generateGrid, fetchContributions, mapContributionsToCells, lastNDays, intensityToColor, } from '@shapegrid/core';
// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadConfig(path) {
    const configPath = resolve(path);
    const raw = readFileSync(configPath, 'utf8');
    return {
        config: yaml.load(raw),
        configDir: dirname(configPath),
    };
}
function resolveToken(tokenOrEnvName) {
    if (tokenOrEnvName.startsWith('ghp_') || tokenOrEnvName.startsWith('github_pat_')) {
        return tokenOrEnvName;
    }
    // Treat as environment variable name
    const val = process.env[tokenOrEnvName];
    if (!val)
        throw new Error(`Environment variable "${tokenOrEnvName}" is not set`);
    return val;
}
function resolveBoundary(src, configDir) {
    if (src.type === 'file') {
        // Load file content and parse
        const filePath = resolve(configDir, src.path);
        const content = readFileSync(filePath, 'utf8');
        const format = src.format ?? (src.path.endsWith('.svg') ? 'svg' : 'geojson');
        return loadBoundaryFromContent(content, format, src.coordinateSystem ?? 'auto');
    }
    return loadBoundary(src);
}
function log(msg) { console.log(chalk.cyan('[shapegrid]'), msg); }
function ok(msg) { console.log(chalk.green('  ✓'), msg); }
function err(msg) { console.error(chalk.red('  ✗'), msg); }
// ─── Generate command ─────────────────────────────────────────────────────────
async function runGenerate(cfg, configDir) {
    log('Starting shapegrid generation…');
    // 1. Resolve token
    const token = resolveToken(cfg.github.token);
    const username = cfg.github.username;
    // 2. Date range
    const { dateRange } = cfg;
    let start, end;
    if (dateRange?.start && dateRange?.end) {
        start = new Date(dateRange.start);
        end = new Date(dateRange.end);
    }
    else {
        const range = lastNDays(dateRange?.last ?? 365);
        start = range.start;
        end = range.end;
    }
    ok(`Date range: ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`);
    // 3. Fetch contributions
    log(`Fetching contributions for @${username}…`);
    const contributions = await fetchContributions(username, start, end, token);
    ok(`${contributions.totalContributions} total contributions`);
    // 4. Load boundary
    log('Loading boundary…');
    const boundary = resolveBoundary(cfg.boundary, configDir);
    ok(`Boundary: ${boundary.length} points`);
    // 5. Generate grid
    if (!Number.isInteger(cfg.grid.count) || cfg.grid.count < 1) {
        throw new Error(`Invalid grid.count: ${cfg.grid.count}; expected a positive integer`);
    }
    if (cfg.grid.type !== 'square' && cfg.grid.type !== 'hex') {
        throw new Error(`Invalid grid.type: ${cfg.grid.type}; expected "square" or "hex"`);
    }
    log(`Generating ${cfg.grid.type} grid (${cfg.grid.count} cells)…`);
    const grid = generateGrid(boundary, {
        count: cfg.grid.count,
        type: cfg.grid.type,
        coverageThreshold: cfg.grid.coverageThreshold,
    });
    if (grid.cells.length === 0) {
        throw new Error('Grid generation produced zero cells; check the boundary shape and coverageThreshold');
    }
    ok(`Placed ${grid.cells.length} cells (cellSize ${grid.cellSize.toFixed(4)})`);
    // 6. Map data to cells
    const cellData = mapContributionsToCells(contributions, grid.cells.length, { start, end });
    // 7. Build export JSON
    const dataExport = {
        version: 1,
        generated: new Date().toISOString(),
        username,
        totalContributions: contributions.totalContributions,
        grid: {
            type: grid.gridType,
            count: grid.cells.length,
            cellSize: grid.cellSize,
            cells: grid.cells.map((c, i) => ({
                cx: c.cx, cy: c.cy,
                date: cellData[i]?.date ?? '',
                count: cellData[i]?.count ?? 0,
                intensity: cellData[i]?.intensity ?? 0,
            })),
        },
        boundary: boundary,
        config: {
            camera: cfg.camera,
            render: cfg.render,
            theme: cfg.theme,
        },
    };
    // 8. Write outputs
    const outDir = resolve(cfg.output.dir);
    mkdirSync(outDir, { recursive: true });
    const jsonFile = join(outDir, cfg.output.jsonFilename ?? 'shapegrid-data.json');
    writeFileSync(jsonFile, JSON.stringify(dataExport, null, 2));
    ok(`Wrote ${jsonFile}`);
    // 9. Generate SVG
    if (cfg.output.svgFilename) {
        const svg = generateSvg(dataExport, cfg);
        const svgFile = join(outDir, cfg.output.svgFilename);
        writeFileSync(svgFile, svg);
        ok(`Wrote ${svgFile}`);
    }
    log(chalk.bold.green('\nDone!'));
    log(`To embed in your README:\n  ![Activity Grid](${cfg.output.svgFilename ?? 'shapegrid-data.json'})`);
}
/** Unit vectors for the 6 pointy-top hex corners (angles -30..270 deg).
 *  Hoisted: per-cell corner offsets are then a multiply, not a cos/sin. */
const HEX_CORNER_DIRS = Array.from({ length: 6 }, (_, i) => {
    const a = ((i * 60 - 30) * Math.PI) / 180;
    return [Math.cos(a), Math.sin(a)];
});
function generateSvg(data, cfg) {
    const W = cfg.output.width ?? 1200;
    const H = cfg.output.height ?? 630;
    // Use theme.palette if available, fallback to render.colorScale
    const colorScale = (cfg.theme?.palette || cfg.render.colorScale || 'github');
    const heightScale = cfg.render.heightScale ?? 1;
    const gap = cfg.render.gap ?? 0.08;
    const bgColor = cfg.render.background ?? '';
    const zoom = cfg.camera.zoom ?? 1.0; // 1.0 = normal, <1 = zoomed in, >1 = zoomed out
    // If dayBorder is set, empty days render as a subtle outline (translucent fill)
    const dayBorder = cfg.theme?.dayBorder ?? '';
    // Isometric projection parameters
    const ISO_YAW = (cfg.camera.yaw ?? 30) * Math.PI / 180;
    const ISO_PITCH = (cfg.camera.pitch ?? 45) * Math.PI / 180;
    // Calculate grid bounds to center properly
    const cells = data.grid.cells;
    if (cells.length === 0) {
        throw new Error('Cannot render SVG: grid has no cells');
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const cell of cells) {
        if (cell.cx < minX)
            minX = cell.cx;
        if (cell.cx > maxX)
            maxX = cell.cx;
        if (cell.cy < minY)
            minY = cell.cy;
        if (cell.cy > maxY)
            maxY = cell.cy;
    }
    const gridCenterX = (minX + maxX) / 2;
    const gridCenterY = (minY + maxY) / 2;
    const gridWidth = maxX - minX;
    const gridHeight = maxY - minY;
    // Cell sizing
    const cellSize = data.grid.cellSize * (1 - gap);
    const halfSize = cellSize / 2;
    const maxExtrusion = 0.15 * heightScale; // max height for cells
    // Isometric projection, fully hoisted: the per-cell hot path now only does
    // a few multiplies and adds (no trig, no per-cell closure, no re-derived scale).
    const cosPitch = Math.cos(ISO_PITCH);
    const sinPitch = Math.sin(ISO_PITCH);
    const baseScale = Math.min(W * 0.65 / (gridWidth + gridHeight), H * 0.55 / (gridWidth + gridHeight));
    const scale = baseScale / zoom; // lower zoom = more zoomed in
    const kx = cosPitch * scale; // screen X per unit of (dx - dy)
    const ky = sinPitch * scale; // screen Y per unit of (dx + dy)
    const kz = scale; // screen Y per unit of extrusion height
    const offX = W / 2;
    const offY = H / 2 + 50; // offset down slightly for title
    // Project a grid-space point (relative to grid centre) at base height.
    const projBase = (dx, dy) => [offX + (dx - dy) * kx, offY + (dx + dy) * ky];
    // Prepare cells with depth info
    const cellRenderData = cells.map(cell => ({
        cx: cell.cx,
        cy: cell.cy,
        intensity: cell.intensity,
        count: cell.count,
        date: cell.date,
        depth: cell.cx + cell.cy,
    }));
    // Sort by depth (back to front for proper rendering)
    cellRenderData.sort((a, b) => a.depth - b.depth);
    // Shade cache: one darken/lighten pass per unique colour instead of per face.
    const colorCache = new Map();
    const paletteFor = (color) => {
        let p = colorCache.get(color);
        if (!p) {
            p = {
                top: color,
                sideLight: darkenColor(color, 0.78),
                sideDark: darkenColor(color, 0.55),
                floor: darkenColor(color, 0.4),
                stroke: lightenColor(color, 1.15),
            };
            colorCache.set(color, p);
        }
        return p;
    };
    // Generate 3D cell geometry
    function renderCell3D(cell) {
        const h = cell.intensity * maxExtrusion;
        const pal = paletteFor(intensityToColor(cell.intensity, colorScale));
        // Empty day with dayBorder set: flat subtle outline (translucent fill so the
        // grid still reads as a solid surface instead of punched-out holes).
        const isEmptyDay = cell.intensity === 0 && dayBorder;
        if (isEmptyDay) {
            if (data.grid.type === 'square') {
                const base = [
                    projBase(cell.cx - gridCenterX - halfSize, cell.cy - gridCenterY - halfSize),
                    projBase(cell.cx - gridCenterX + halfSize, cell.cy - gridCenterY - halfSize),
                    projBase(cell.cx - gridCenterX + halfSize, cell.cy - gridCenterY + halfSize),
                    projBase(cell.cx - gridCenterX - halfSize, cell.cy - gridCenterY + halfSize),
                ];
                return `<g>
  <title>${cell.date}: ${cell.count} contributions</title>
  <polygon
    points="${polyPoints(base)}"
    fill="${dayBorder}"
    fill-opacity="0.06"
    stroke="${dayBorder}"
    stroke-width="0.8"
    stroke-linejoin="round"
  />
</g>`;
            }
            const base = hexProjected(cell, 0);
            return `<g>
  <title>${cell.date}: ${cell.count} contributions</title>
  <polygon
    points="${polyPoints(base)}"
    fill="${dayBorder}"
    fill-opacity="0.06"
    stroke="${dayBorder}"
    stroke-width="0.8"
    stroke-linejoin="round"
  />
</g>`;
        }
        if (data.grid.type === 'square') {
            // Corner grid-space offsets (relative to grid centre), TL, TR, BR, BL.
            const dx0 = cell.cx - gridCenterX - halfSize;
            const dx1 = cell.cx - gridCenterX + halfSize;
            const dy0 = cell.cy - gridCenterY - halfSize;
            const dy1 = cell.cy - gridCenterY + halfSize;
            const base = [projBase(dx0, dy0), projBase(dx1, dy0), projBase(dx1, dy1), projBase(dx0, dy1)];
            const top = [
                [base[0][0], base[0][1] - h * kz],
                [base[1][0], base[1][1] - h * kz],
                [base[2][0], base[2][1] - h * kz],
                [base[3][0], base[3][1] - h * kz],
            ];
            // Directional shading: lit face (screen-left) vs shadow face (screen-right),
            // plus a darker floor. Two clearly distinct side tones give a gradient feel.
            return `<g>
  <title>${cell.date}: ${cell.count} contributions</title>
  <!-- Floor/base face (visible through transparent empty cells) -->
  <polygon
    points="${polyPoints(base)}"
    fill="${pal.floor}"
    stroke="${pal.floor}"
    stroke-width="0.35"
    stroke-linejoin="round"
  />
  <!-- Left face (lit) -->
  <polygon
    points="${fmt(top[3])} ${fmt(base[3])} ${fmt(base[0])} ${fmt(top[0])}"
    fill="${pal.sideLight}"
    stroke="${pal.sideLight}"
    stroke-width="0.4"
    stroke-linejoin="round"
  />
  <!-- Right face (shadow) -->
  <polygon
    points="${fmt(top[0])} ${fmt(base[0])} ${fmt(base[1])} ${fmt(top[1])}"
    fill="${pal.sideDark}"
    stroke="${pal.sideDark}"
    stroke-width="0.4"
    stroke-linejoin="round"
  />
  <!-- Top face -->
  <polygon
    points="${polyPoints(top)}"
    fill="${pal.top}"
    stroke="${pal.stroke}"
    stroke-width="0.6"
    stroke-linejoin="round"
  />
</g>`;
        }
        // Hexagonal cells
        const hexBase = hexProjected(cell, 0);
        const hexTop = hexProjected(cell, h);
        // Visible faces (top 3): lit edge (4-5) vs shadow edge (5-0), darker floor.
        return `<g>
  <title>${cell.date}: ${cell.count} contributions</title>
  <!-- Floor/base face (visible through transparent empty cells) -->
  <polygon
    points="${polyPoints(hexBase)}"
    fill="${pal.floor}"
    stroke="${pal.floor}"
    stroke-width="0.35"
    stroke-linejoin="round"
  />
  <!-- Side face (lit) -->
  <polygon
    points="${fmt(hexTop[4])} ${fmt(hexBase[4])} ${fmt(hexBase[5])} ${fmt(hexTop[5])}"
    fill="${pal.sideLight}"
    stroke="${pal.sideLight}"
    stroke-width="0.4"
    stroke-linejoin="round"
  />
  <!-- Side face (shadow) -->
  <polygon
    points="${fmt(hexTop[5])} ${fmt(hexBase[5])} ${fmt(hexBase[0])} ${fmt(hexTop[0])}"
    fill="${pal.sideDark}"
    stroke="${pal.sideDark}"
    stroke-width="0.4"
    stroke-linejoin="round"
  />
  <!-- Top face -->
  <polygon
    points="${polyPoints(hexTop)}"
    fill="${pal.top}"
    stroke="${pal.stroke}"
    stroke-width="0.6"
    stroke-linejoin="round"
  />
</g>`;
    }
    /** Project the 6 hex corners of a cell at height z (uses hoisted dir vectors). */
    function hexProjected(cell, z) {
        const cxd = cell.cx - gridCenterX;
        const cyd = cell.cy - gridCenterY;
        const pts = new Array(6);
        for (let i = 0; i < 6; i++) {
            const dx = cxd + HEX_CORNER_DIRS[i][0] * halfSize;
            const dy = cyd + HEX_CORNER_DIRS[i][1] * halfSize;
            const bx = offX + (dx - dy) * kx;
            const by = offY + (dx + dy) * ky - z * kz;
            pts[i] = [bx, by];
        }
        return pts;
    }
    // Build SVG content
    const cellsSvg = cellRenderData.map(renderCell3D).join('\n    ');
    // Legend gradient stops (shared defs, hoisted out of the legend group)
    const legendStops = Array.from({ length: 20 }, (_, i) => {
        const t = i / 19;
        return `<stop offset="${(t * 100).toFixed(0)}%" stop-color="${intensityToColor(t, colorScale)}"/>`;
    }).join('\n      ');
    // Generate professional legend
    const legend = generateLegend(colorScale, W, H);
    // Generate coordinate axes
    const coordAxes = generateCoordAxes(data, cfg, minX, maxX, minY, maxY, W, H, zoom, ISO_YAW, ISO_PITCH);
    // Title and metadata
    const titleY = 35;
    const subtitleY = 52;
    const footerY = H - 15;
    const totalContribs = data.totalContributions;
    const cellCount = data.grid.cells.length;
    const dateRange = getDateRange(data);
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <!-- Glow filter for title -->
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <!-- Soft drop shadow under the whole grid for depth -->
    <filter id="cell-shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="9" stdDeviation="11" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
    <linearGradient id="legend-grad" x1="0" y1="0" x2="1" y2="0">
      ${legendStops}
    </linearGradient>
  </defs>
${bgColor ? `
  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg-grad)"/>
  <defs>
    <linearGradient id="bg-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bgColor}"/>
      <stop offset="100%" stop-color="${darkenColor(bgColor, 0.85)}"/>
    </linearGradient>
  </defs>
` : ''}
  <!-- Title Section -->
  <g id="title" filter="url(#glow)">
    <text x="${W / 2}" y="${titleY}" text-anchor="middle" fill="#e6edf3" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600" letter-spacing="0.5">
      @${data.username}
    </text>
  </g>
  <text x="${W / 2}" y="${subtitleY}" text-anchor="middle" fill="#8b949e" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="300" letter-spacing="0.3">
    ${totalContribs} contributions · ${cellCount} days · ${dateRange}
  </text>
${coordAxes}
  <!-- Grid Cells -->
  <g id="cells" shape-rendering="geometricPrecision" filter="url(#cell-shadow)">
    ${cellsSvg}
  </g>

  <!-- Legend -->
  ${legend}

  <!-- Footer -->
  <text x="${W / 2}" y="${footerY}" text-anchor="middle" fill="#8b949e" font-family="'IBM Plex Mono', monospace" font-size="9" letter-spacing="0.5">
    Generated by shapegrid · ${new Date().toISOString().split('T')[0]}
  </text>
</svg>`;
}
// ─── Legend generator ────────────────────────────────────────────────────────
function generateLegend(colorScale, W, H) {
    const barX = 36;
    const barY = H - 46;
    const barW = 190;
    const barH = 10;
    const panelX = barX - 18;
    const panelY = barY - 32;
    const panelW = barW + 36;
    const panelH = 62;
    // Labels
    const labels = [
        { pos: 0, text: '0' },
        { pos: 0.25, text: '25%' },
        { pos: 0.5, text: '50%' },
        { pos: 0.75, text: '75%' },
        { pos: 1.0, text: 'Max' },
    ];
    const labelElements = labels.map(label => {
        const x = barX + label.pos * barW;
        return `<text x="${x.toFixed(1)}" y="${barY + barH + 14}" text-anchor="middle" fill="#8b949e" font-family="'IBM Plex Mono', monospace" font-size="8" font-variant-numeric="tabular-nums">${label.text}</text>`;
    }).join('\n    ');
    return `  <!-- Legend -->
  <g id="legend">
    <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <text x="${barX}" y="${barY - 10}" fill="#8b949e" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="600" letter-spacing="1.4">
      ACTIVITY INTENSITY
    </text>
    <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="${barH / 2}" fill="url(#legend-grad)" stroke="rgba(255,255,255,0.12)" stroke-width="0.5"/>
    ${labelElements}
  </g>`;
}
// ─── Coordinate Axes ──────────────────────────────────────────────────────────
function generateCoordAxes(data, cfg, minX, maxX, minY, maxY, W, H, zoom, ISO_YAW, ISO_PITCH) {
    const axesCfg = cfg.axes;
    const enabled = axesCfg?.enabled ?? (data.coordSystem === 'wgs84' || data.coordSystem === 'mercator');
    if (!enabled || !data.geoBounds || !data.coordSystem || data.coordSystem === 'planar') {
        return '';
    }
    const { minLon, maxLon, minLat, maxLat } = data.geoBounds;
    const lonSpan = maxLon - minLon;
    const latSpan = maxLat - minLat;
    // Grid dimensions in normalized space
    const normW = maxX - minX;
    const normH = maxY - minY;
    // Configuration options
    const position = axesCfg?.position ?? 'outside';
    const lineColor = axesCfg?.lineColor ?? '#666666';
    const labelColor = axesCfg?.labelColor ?? '#888888';
    const labelFont = axesCfg?.labelFont ?? 'IBM Plex Mono, monospace';
    const labelScale = axesCfg?.labelScale ?? 1.0;
    const distance = axesCfg?.distance ?? 0.06; // Distance from grid edge
    const fontSize = Math.round(9 * labelScale);
    // Project point to isometric coordinates (same as cells)
    function projectIso(x, y, z = 0) {
        const dx = x - (minX + maxX) / 2;
        const dy = y - (minY + maxY) / 2;
        const dz = z;
        const isoX = (dx * Math.cos(ISO_YAW) - dy * Math.sin(ISO_YAW)) * zoom * (W * 0.4);
        const isoY = (dx * Math.sin(ISO_YAW) * Math.sin(ISO_PITCH) + dy * Math.cos(ISO_YAW) * Math.sin(ISO_PITCH) - dz * Math.cos(ISO_PITCH)) * zoom * (W * 0.4);
        return [W / 2 + isoX, H / 2 + isoY];
    }
    function formatCoord(value, isLat) {
        const absVal = Math.abs(value);
        const dir = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
        return `${absVal.toFixed(1)}°${dir}`;
    }
    function niceInterval(range, targetTicks = 4) {
        const rough = range / targetTicks;
        const exp = Math.floor(Math.log10(rough));
        const frac = rough / Math.pow(10, exp);
        let nice;
        if (frac <= 1.5)
            nice = 1;
        else if (frac <= 3)
            nice = 2;
        else if (frac <= 7)
            nice = 5;
        else
            nice = 10;
        return nice * Math.pow(10, exp);
    }
    const offset = distance;
    const tickLen = 0.015;
    const tickDir = position === 'outside' ? 1 : -1;
    // Grid edges
    const left = minX + (position === 'outside' ? -offset : offset);
    const right = maxX + (position === 'outside' ? offset : -offset);
    const bottom = maxY + (position === 'outside' ? offset : -offset);
    const top = minY + (position === 'outside' ? -offset : offset);
    let svg = `\n  <!-- Coordinate Axes -->\n  <g id="coord-axes" stroke="${lineColor}" stroke-width="1" fill="none">\n`;
    // Bottom axis line (longitude)
    const [bl, blY] = projectIso(left, bottom);
    const [br, brY] = projectIso(right, bottom);
    svg += `    <line x1="${bl.toFixed(1)}" y1="${blY.toFixed(1)}" x2="${br.toFixed(1)}" y2="${brY.toFixed(1)}"/>\n`;
    // Left axis line (latitude)
    const [tl, tlY] = projectIso(left, top);
    svg += `    <line x1="${bl.toFixed(1)}" y1="${blY.toFixed(1)}" x2="${tl.toFixed(1)}" y2="${tlY.toFixed(1)}"/>\n`;
    svg += `  </g>\n  <g id="coord-labels" fill="${labelColor}" font-family="${labelFont}" font-size="${fontSize}">\n`;
    // Longitude ticks
    const lonInterval = niceInterval(lonSpan);
    const lonStart = Math.ceil(minLon / lonInterval) * lonInterval;
    for (let lon = lonStart; lon <= maxLon; lon += lonInterval) {
        const t = (lon - minLon) / lonSpan;
        const x = minX + t * normW;
        const [tx, ty] = projectIso(x, bottom);
        const [tx2, ty2] = projectIso(x, bottom + tickLen * tickDir);
        svg += `    <line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${tx2.toFixed(1)}" y2="${ty2.toFixed(1)}" stroke="${lineColor}" stroke-width="0.5"/>\n`;
        const labelOffset = position === 'outside' ? 12 : -6;
        svg += `    <text x="${tx2.toFixed(1)}" y="${(ty2 + labelOffset).toFixed(1)}" text-anchor="middle">${formatCoord(lon, false)}</text>\n`;
    }
    // Latitude ticks
    const latInterval = niceInterval(latSpan);
    const latStart = Math.ceil(minLat / latInterval) * latInterval;
    for (let lat = latStart; lat <= maxLat; lat += latInterval) {
        const t = (lat - minLat) / latSpan;
        const y = minY + t * normH; // FIX: Don't flip here, the projection already handles it
        const [tx, ty] = projectIso(left, y);
        const [tx2, ty2] = projectIso(left + tickLen * tickDir, y);
        svg += `    <line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${tx2.toFixed(1)}" y2="${ty2.toFixed(1)}" stroke="${lineColor}" stroke-width="0.5"/>\n`;
        const labelOffset = position === 'outside' ? -5 : 8;
        const textAnchor = position === 'outside' ? 'end' : 'start';
        svg += `    <text x="${(tx2 + labelOffset).toFixed(1)}" y="${(ty2 + 3).toFixed(1)}" text-anchor="${textAnchor}">${formatCoord(lat, true)}</text>\n`;
    }
    svg += '  </g>';
    return svg;
}
// ─── SVG utilities ────────────────────────────────────────────────────────────
/** "x,y x,y ..." for a closed polygon (no intermediate array allocations). */
function polyPoints(pts) {
    let s = '';
    for (let i = 0; i < pts.length; i++) {
        if (i > 0)
            s += ',';
        s += pts[i][0].toFixed(1) + ',' + pts[i][1].toFixed(1);
    }
    return s;
}
/** "x,y" for a single projected point. */
function fmt(p) {
    return p[0].toFixed(1) + ',' + p[1].toFixed(1);
}
// ─── Color utilities ─────────────────────────────────────────────────────────
function darkenColor(hex, factor) {
    const rgb = hexToRgb(hex);
    if (!rgb)
        return hex;
    const r = Math.round(rgb.r * factor);
    const g = Math.round(rgb.g * factor);
    const b = Math.round(rgb.b * factor);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
function lightenColor(hex, factor) {
    const rgb = hexToRgb(hex);
    if (!rgb)
        return hex;
    const r = Math.min(255, Math.round(rgb.r * factor));
    const g = Math.min(255, Math.round(rgb.g * factor));
    const b = Math.min(255, Math.round(rgb.b * factor));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
    } : null;
}
// ─── Date range helper ───────────────────────────────────────────────────────
function getDateRange(data) {
    const dates = data.grid.cells
        .map(c => c.date)
        .filter(d => d)
        .sort();
    if (dates.length === 0)
        return 'N/A';
    const start = dates[0];
    const end = dates[dates.length - 1];
    // Format as "Apr 2025 - Apr 2026"
    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    };
    return `${formatDate(start)} - ${formatDate(end)}`;
}
// ─── CLI setup ────────────────────────────────────────────────────────────────
const argv = await yargs(hideBin(process.argv))
    .scriptName('shapegrid')
    .command('generate', 'Generate activity grid image from GitHub contributions', y => y
    .option('config', { alias: 'c', type: 'string', describe: 'Path to config YAML', default: 'shapegrid.config.yml' })
    .option('user', { type: 'string', describe: 'GitHub username (overrides config)' })
    .option('token', { type: 'string', describe: 'GitHub token or env var name (overrides config)' })
    .option('count', { type: 'number', describe: 'Cell count (overrides config)' })
    .option('type', { type: 'string', choices: ['square', 'hex'], describe: 'Grid type (overrides config)' })
    .option('country', { type: 'string', describe: 'Country code (ISO 3166-1 alpha-2) for boundary shape' })
    .option('boundary-file', { type: 'string', describe: 'Path to GeoJSON or SVG boundary file' }), async (args) => {
    try {
        const { config: cfg, configDir } = loadConfig(args.config);
        if (args.user)
            cfg.github.username = args.user;
        if (args.token)
            cfg.github.token = args.token;
        if (args.count !== undefined && args.count !== null)
            cfg.grid.count = args.count;
        if (args.type)
            cfg.grid.type = args.type;
        if (args.country) {
            cfg.boundary = { type: 'country', code: args.country };
        }
        if (args['boundary-file']) {
            cfg.boundary = { type: 'file', path: args['boundary-file'] };
        }
        await runGenerate(cfg, configDir);
    }
    catch (e) {
        err(String(e));
        process.exit(1);
    }
})
    .demandCommand(1, 'Specify a command: generate')
    .help()
    .argv;
//# sourceMappingURL=index.js.map