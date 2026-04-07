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
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import chalk from 'chalk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import {
  loadBoundary,
  loadBoundaryFromContent,
  generateGrid,
  fetchContributions,
  mapContributionsToCells,
  lastNDays,
  intensityToColor,
  legendStops,
  type BoundarySource,
  type GridType,
  type ColorScale,
  type Polygon,
} from '@shapegrid/core';

// ─── Config schema ────────────────────────────────────────────────────────────

export interface ShapegridConfig {
  github: {
    username: string;
    token: string;               // env var name or literal (prefer env)
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
    zoom?: number;               // orthographic frustum scale (0.5-3.0, lower = more zoomed in)
  };
  theme?: {
    palette?: string;            // palette name or 'custom'
    customPalette?: {
      name: string;
      colors: string[];
    };
    /** Border color for empty days (no fill). Use on light backgrounds. */
    dayBorder?: string;
  };
  /** Coordinate axes configuration (for geographic data) */
  axes?: {
    enabled?: boolean;           // show coordinate axes
    position?: 'outside' | 'inside'; // axis position relative to grid
    distance?: number;           // distance from grid edge (0.01-0.2, default: 0.06)
    lineColor?: string;          // axis line color (CSS hex)
    labelColor?: string;         // label text color (CSS hex)
    labelFont?: string;          // font family for labels
    labelScale?: number;         // label size multiplier (0.3-3.0)
  };
  render: {
    colorScale: ColorScale;
    heightScale: number;
    showBoundary: boolean;
    background: string;
    gap: number;
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
    last?: number;          // last N days (default 365)
    start?: string;         // ISO date
    end?: string;           // ISO date
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadConfig(path: string): { config: ShapegridConfig; configDir: string } {
  const configPath = resolve(path);
  const raw = readFileSync(configPath, 'utf8');
  return {
    config: yaml.load(raw) as ShapegridConfig,
    configDir: dirname(configPath),
  };
}

function resolveBoundary(src: BoundarySource, configDir: string): Polygon {
  if (src.type === 'file') {
    const filePath = resolve(configDir, src.path);
    const content = readFileSync(filePath, 'utf8');
    const format = src.format ?? (src.path.endsWith('.svg') ? 'svg' : 'geojson');
    return loadBoundaryFromContent(content, format, src.coordinateSystem ?? 'auto');
  }
  return loadBoundary(src);
}

function resolveToken(tokenOrEnvName: string): string {
  if (tokenOrEnvName.startsWith('ghp_') || tokenOrEnvName.startsWith('github_pat_')) {
    return tokenOrEnvName;
  }
  // Treat as environment variable name
  const val = process.env[tokenOrEnvName];
  if (!val) throw new Error(`Environment variable "${tokenOrEnvName}" is not set`);
  return val;
}

function log(msg: string) { console.log(chalk.cyan('[shapegrid]'), msg); }
function ok(msg: string)  { console.log(chalk.green('  ✓'), msg); }
function err(msg: string) { console.error(chalk.red('  ✗'), msg); }

// ─── JSON data export (for web viewer) ───────────────────────────────────────

interface DataExport {
  version: number;
  generated: string;
  username: string;
  totalContributions: number;
  grid: {
    type: GridType;
    count: number;
    cellSize: number;
    cells: {
      cx: number; cy: number;
      date: string; count: number; intensity: number;
    }[];
  };
  boundary: [number, number][];
  config: Pick<ShapegridConfig, 'camera' | 'render'>;
  /** Geographic bounds for coordinate axes (if applicable) */
  geoBounds?: {
    minLon: number; maxLon: number;
    minLat: number; maxLat: number;
  };
  /** Coordinate system used (if applicable) */
  coordSystem?: string;
}

// ─── Generate command ─────────────────────────────────────────────────────────

async function runGenerate(cfg: ShapegridConfig, configDir: string) {
  log('Starting shapegrid generation…');

  // 1. Resolve token
  const token = resolveToken(cfg.github.token);
  const username = cfg.github.username;

  // 2. Date range
  const { dateRange } = cfg;
  let start: Date, end: Date;
  if (dateRange?.start && dateRange?.end) {
    start = new Date(dateRange.start);
    end   = new Date(dateRange.end);
  } else {
    const range = lastNDays(dateRange?.last ?? 365);
    start = range.start;
    end   = range.end;
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
  log(`Generating ${cfg.grid.type} grid (${cfg.grid.count} cells)…`);
  const grid = generateGrid(boundary, {
    count: cfg.grid.count,
    type: cfg.grid.type,
    coverageThreshold: cfg.grid.coverageThreshold,
  });
  ok(`Placed ${grid.cells.length} cells (cellSize ${grid.cellSize.toFixed(4)})`);

  // 6. Map data to cells
  const cellData = mapContributionsToCells(contributions, grid.cells.length, { start, end });

  // 7. Build export JSON
  const dataExport: DataExport = {
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

  log(chalk.bold.green('\nDone! 🎉'));
  log(`To embed in your README:\n  ![Activity Grid](${cfg.output.svgFilename ?? 'shapegrid-data.json'})`);
}

// ─── SVG generator (server-side, no WebGL needed) ────────────────────────────

interface CellRenderData {
  cx: number;
  cy: number;
  intensity: number;
  count: number;
  date: string;
  depth: number; // for z-sorting
}

function generateSvg(data: DataExport, cfg: ShapegridConfig): string {
  const W = cfg.output.width ?? 1200;
  const H = cfg.output.height ?? 630;
  
  // Use theme.palette if available, fallback to render.colorScale
  const colorScale = (cfg.theme?.palette || cfg.render.colorScale || 'github') as ColorScale;
  const heightScale = cfg.render.heightScale ?? 1;
  const gap = cfg.render.gap ?? 0.08;
  const bgColor = cfg.render.background ?? '';
  const zoom = cfg.camera.zoom ?? 1.0; // 1.0 = normal, <1 = zoomed in, >1 = zoomed out
  // If dayBorder is set, empty days render as border-only (no fill)
  const dayBorder = cfg.theme?.dayBorder ?? '';

  // Isometric projection parameters
  const ISO_YAW = (cfg.camera.yaw ?? 30) * Math.PI / 180;
  const ISO_PITCH = (cfg.camera.pitch ?? 45) * Math.PI / 180;

  // Calculate grid bounds to center properly
  const cells = data.grid.cells;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  cells.forEach(cell => {
    minX = Math.min(minX, cell.cx);
    maxX = Math.max(maxX, cell.cx);
    minY = Math.min(minY, cell.cy);
    maxY = Math.max(maxY, cell.cy);
  });

  const gridCenterX = (minX + maxX) / 2;
  const gridCenterY = (minY + maxY) / 2;
  const gridWidth = maxX - minX;
  const gridHeight = maxY - minY;

  // Cell sizing
  const cellSize = data.grid.cellSize * (1 - gap);
  const maxExtrusion = 0.15 * heightScale; // max height for cells

  // Isometric projection with proper 3D math
  function projectIso(x: number, y: number, z = 0): [number, number] {
    // Center the grid
    const cx = x - gridCenterX;
    const cy = y - gridCenterY;

    // Isometric transformation
    const screenX = (cx - cy) * Math.cos(ISO_PITCH);
    const screenY = (cx + cy) * Math.sin(ISO_PITCH) - z;

    // Scale and position (zoom affects the scale factor)
    const baseScale = Math.min(W * 0.65 / (gridWidth + gridHeight), H * 0.55 / (gridWidth + gridHeight));
    const scale = baseScale / zoom; // lower zoom = more zoomed in
    return [
      W / 2 + screenX * scale,
      H / 2 + 50 + screenY * scale, // offset down slightly for title
    ];
  }

  // Prepare cells with depth info
  const cellRenderData: CellRenderData[] = cells.map(cell => {
    const cx = cell.cx;
    const cy = cell.cy;
    const h = cell.intensity * maxExtrusion;
    // Depth for z-sorting (further back first)
    const depth = (cx + cy);

    return {
      cx, cy,
      intensity: cell.intensity,
      count: cell.count,
      date: cell.date,
      depth,
    };
  });

  // Sort by depth (back to front for proper rendering)
  cellRenderData.sort((a, b) => a.depth - b.depth);

  // Generate 3D cell geometry
  function renderCell3D(cell: CellRenderData): string {
    const h = cell.intensity * maxExtrusion;
    const color = intensityToColor(cell.intensity, colorScale);
    const halfSize = cellSize / 2;

    // Calculate positions for all corners and heights
    const corners = [
      { x: cell.cx - halfSize, y: cell.cy - halfSize }, // top-left
      { x: cell.cx + halfSize, y: cell.cy - halfSize }, // top-right
      { x: cell.cx + halfSize, y: cell.cy + halfSize }, // bottom-right
      { x: cell.cx - halfSize, y: cell.cy + halfSize }, // bottom-left
    ];

    // Project all corners at base (z=0) and top (z=h)
    const base = corners.map(c => projectIso(c.x, c.y, 0));
    const top = corners.map(c => projectIso(c.x, c.y, h));

    // Empty day with dayBorder set: render as border-only (no fill)
    const isEmptyDay = cell.intensity === 0 && dayBorder;

    if (data.grid.type === 'square') {
      // Empty day: flat border-only square
      if (isEmptyDay) {
        return `<g>
  <title>${cell.date}: ${cell.count} contributions</title>
  <polygon
    points="${base.map(formatPolygonPoints).join(',')}"
    fill="none"
    stroke="${dayBorder}"
    stroke-width="0.8"
    stroke-linejoin="round"
  />
</g>`;
      }

      // Darken color for side faces (simulates shadow)
      const sideColor = darkenColor(color, 0.7);
      const topColor = color;
      // Floor uses darkened column color (visible through transparent empty cells)
      const floorColor = darkenColor(color, 0.5);

      return `<g>
  <title>${cell.date}: ${cell.count} contributions</title>
  <!-- Floor/base face (visible through transparent empty cells) -->
  <polygon
    points="${base.map(formatPolygonPoints).join(',')}"
    fill="${floorColor}"
    stroke="${floorColor}"
    stroke-width="0.5"
    stroke-linejoin="round"
  />
  <!-- Left face -->
  <polygon
    points="${formatPolygonPoints(top[3])} ${formatPolygonPoints(base[3])} ${formatPolygonPoints(base[0])} ${formatPolygonPoints(top[0])}"
    fill="${sideColor}"
    stroke="${sideColor}"
    stroke-width="0.5"
    stroke-linejoin="round"
  />
  <!-- Right face -->
  <polygon
    points="${formatPolygonPoints(top[0])} ${formatPolygonPoints(base[0])} ${formatPolygonPoints(base[1])} ${formatPolygonPoints(top[1])}"
    fill="${darkenColor(color, 0.85)}"
    stroke="${darkenColor(color, 0.85)}"
    stroke-width="0.5"
    stroke-linejoin="round"
  />
  <!-- Top face -->
  <polygon
    points="${top.map(formatPolygonPoints).join(',')}"
    fill="${topColor}"
    stroke="${lightenColor(color, 1.15)}"
    stroke-width="0.8"
    stroke-linejoin="round"
  />
</g>`;
    } else {
      // Hexagonal cells
      const hexCorners = Array.from({ length: 6 }, (_, i) => {
        const angle = (i * 60 - 30) * Math.PI / 180;
        return {
          x: cell.cx + halfSize * Math.cos(angle),
          y: cell.cy + halfSize * Math.sin(angle),
        };
      });

      const hexBase = hexCorners.map(c => projectIso(c.x, c.y, 0));
      const hexTop = hexCorners.map(c => projectIso(c.x, c.y, h));

      // Empty day: flat border-only hexagon
      if (isEmptyDay) {
        return `<g>
  <title>${cell.date}: ${cell.count} contributions</title>
  <polygon
    points="${hexBase.map(formatPolygonPoints).join(',')}"
    fill="none"
    stroke="${dayBorder}"
    stroke-width="0.8"
    stroke-linejoin="round"
  />
</g>`;
      }

      // Visible faces (top 3)
      const sideColor = darkenColor(color, 0.7);
      const topColor = color;
      // Floor uses darkened column color (visible through transparent empty cells)
      const floorColor = darkenColor(color, 0.5);

      return `<g>
  <title>${cell.date}: ${cell.count} contributions</title>
  <!-- Floor/base face (visible through transparent empty cells) -->
  <polygon
    points="${hexBase.map(formatPolygonPoints).join(',')}"
    fill="${floorColor}"
    stroke="${floorColor}"
    stroke-width="0.5"
    stroke-linejoin="round"
  />
  <!-- Side faces -->
  <polygon
    points="${formatPolygonPoints(hexTop[4])} ${formatPolygonPoints(hexBase[4])} ${formatPolygonPoints(hexBase[5])} ${formatPolygonPoints(hexTop[5])}"
    fill="${sideColor}"
    stroke="${sideColor}"
    stroke-width="0.5"
  />
  <polygon
    points="${formatPolygonPoints(hexTop[5])} ${formatPolygonPoints(hexBase[5])} ${formatPolygonPoints(hexBase[0])} ${formatPolygonPoints(hexTop[0])}"
    fill="${darkenColor(color, 0.85)}"
    stroke="${darkenColor(color, 0.85)}"
    stroke-width="0.5"
  />
  <!-- Top face -->
  <polygon
    points="${hexTop.map(formatPolygonPoints).join(',')}"
    fill="${topColor}"
    stroke="${lightenColor(color, 1.15)}"
    stroke-width="0.8"
    stroke-linejoin="round"
  />
</g>`;
    }
  }

  // Build SVG content
  const cellsSvg = cellRenderData.map(renderCell3D).join('\n    ');

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

  <!-- Coordinate Axes -->
  ${coordAxes}

  <!-- Grid Cells -->
  <g id="cells" shape-rendering="geometricPrecision">
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

function generateLegend(colorScale: ColorScale, W: number, H: number): string {
  const legendX = 20;
  const legendY = H - 50;
  const legendWidth = 200;
  const legendHeight = 30;
  const swatchCount = 20;

  // Generate gradient stops
  const stops = Array.from({ length: swatchCount }, (_, i) => {
    const t = i / (swatchCount - 1);
    const color = intensityToColor(t, colorScale);
    return `<stop offset="${(t * 100).toFixed(0)}%" stop-color="${color}"/>`;
  }).join('\n      ');

  // Labels
  const labels = [
    { pos: 0, text: '0' },
    { pos: 0.25, text: '25%' },
    { pos: 0.5, text: '50%' },
    { pos: 0.75, text: '75%' },
    { pos: 1.0, text: 'Max' },
  ];

  const labelElements = labels.map(label => {
    const x = legendX + label.pos * legendWidth;
    return `<text x="${x}" y="${legendY + legendHeight + 12}" text-anchor="middle" fill="#8b949e" font-family="'IBM Plex Mono', monospace" font-size="8">${label.text}</text>`;
  }).join('\n    ');

  return `  <!-- Legend -->
  <g id="legend">
    <text x="${legendX}" y="${legendY - 8}" fill="#8b949e" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="500" letter-spacing="0.5">
      ACTIVITY INTENSITY
    </text>
    <rect x="${legendX}" y="${legendY}" width="${legendWidth}" height="${legendHeight}" rx="3" fill="url(#legend-grad)"/>
    <defs>
      <linearGradient id="legend-grad" x1="0" y1="0" x2="1" y2="0">
        ${stops}
      </linearGradient>
    </defs>
    ${labelElements}
  </g>`;
}

// ─── Coordinate axes for geographic data ──────────────────────────────────────

function generateCoordAxes(
  data: DataExport,
  cfg: ShapegridConfig,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  W: number,
  H: number,
  zoom: number,
  ISO_YAW: number,
  ISO_PITCH: number
): string {
  // Only render if geographic bounds are available
  if (!data.geoBounds || !data.coordSystem) return '';
  const coordSys = data.coordSystem;
  if (coordSys !== 'wgs84' && coordSys !== 'mercator') return '';

  // Check if axes are enabled (default to true for geographic data)
  const axesEnabled = cfg.axes?.enabled ?? true;
  if (!axesEnabled) return '';

  // Configuration
  const position = cfg.axes?.position ?? 'outside';
  const lineColor = cfg.axes?.lineColor ?? '#666666';
  const labelColor = cfg.axes?.labelColor ?? '#888888';
  const labelFont = cfg.axes?.labelFont ?? 'IBM Plex Mono, monospace';
  const labelScale = cfg.axes?.labelScale ?? 1.0;
  const distance = cfg.axes?.distance ?? 0.06; // Distance from grid edge

  const { minLon, maxLon, minLat, maxLat } = data.geoBounds;
  
  // Helper: nice tick interval
  function niceInterval(range: number, targetTicks = 4): number {
    const rough = range / targetTicks;
    const exp = Math.floor(Math.log10(rough));
    const frac = rough / Math.pow(10, exp);
    let nice;
    if (frac <= 1.5) nice = 1;
    else if (frac <= 3) nice = 2;
    else if (frac <= 7) nice = 5;
    else nice = 10;
    return nice * Math.pow(10, exp);
  }

  // Helper: format coordinate
  function formatCoord(value: number, isLat: boolean): string {
    const absVal = Math.abs(value);
    const dir = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    return `${absVal.toFixed(1)}°${dir}`;
  }

  // Isometric projection
  function projectIso(x: number, y: number): [number, number] {
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const dx = x - cx, dy = y - cy;
    const px = dx * Math.cos(ISO_YAW) - dy * Math.sin(ISO_YAW);
    const pz = dx * Math.sin(ISO_YAW) + dy * Math.cos(ISO_YAW);
    const py = pz * Math.sin(ISO_PITCH);
    const scale = Math.min(W, H) * zoom * 0.45;
    return [W / 2 + px * scale, H / 2 - py * scale];
  }

  let svg = '  <g class="coord-axes" style="font-family: ' + labelFont + '; font-size: ' + (12 * labelScale) + 'px; fill: ' + labelColor + ';">\n';

  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;
  const maxSpan = Math.max(lonSpan, latSpan);
  const normW = lonSpan / maxSpan;
  const normH = latSpan / maxSpan;

  // Grid edges in normalized space with offset
  const offset = distance * (maxX - minX); // Scale distance to actual grid size
  const left = minX + (position === 'outside' ? -offset : offset);
  const right = minX + normW * (maxX - minX) + (position === 'outside' ? offset : -offset);
  const top = minY + (position === 'outside' ? -offset : offset);
  const bottom = minY + normH * (maxY - minY) + (position === 'outside' ? offset : -offset);

  // Position logic
  const isOutside = position === 'outside';
  const tickLen = 0.015 * (maxX - minX);
  const tickDir = isOutside ? 1 : -1;

  // Longitude ticks
  const lonInterval = niceInterval(lonSpan);
  const lonStart = Math.ceil(minLon / lonInterval) * lonInterval;
  for (let lon = lonStart; lon <= maxLon; lon += lonInterval) {
    const t = (lon - minLon) / lonSpan;
    const x = minX + t * normW * (maxX - minX);
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
    const y = minY + t * normH * (maxY - minY);
    const [tx, ty] = projectIso(left, y);
    const [tx2, ty2] = projectIso(left + tickLen * tickDir * (maxX - minX), y);
    svg += `    <line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${tx2.toFixed(1)}" y2="${ty2.toFixed(1)}" stroke="${lineColor}" stroke-width="0.5"/>\n`;
    const labelOffset = position === 'outside' ? -5 : 8;
    const textAnchor = position === 'outside' ? 'end' : 'start';
    svg += `    <text x="${(tx2 + labelOffset).toFixed(1)}" y="${(ty2 + 3).toFixed(1)}" text-anchor="${textAnchor}">${formatCoord(lat, true)}</text>\n`;
  }

  svg += '  </g>';
  return svg;
}

// ─── SVG utilities ────────────────────────────────────────────────────────────

function formatPolygonPoints(point: [number, number]): string {
  return point.map(p => p.toFixed(1)).join(',');
}

// ─── Color utilities ─────────────────────────────────────────────────────────

function darkenColor(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.round(rgb.r * factor);
  const g = Math.round(rgb.g * factor);
  const b = Math.round(rgb.b * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function lightenColor(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.min(255, Math.round(rgb.r * factor));
  const g = Math.min(255, Math.round(rgb.g * factor));
  const b = Math.min(255, Math.round(rgb.b * factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

// ─── Date range helper ───────────────────────────────────────────────────────

function getDateRange(data: DataExport): string {
  const dates = data.grid.cells
    .map(c => c.date)
    .filter(d => d)
    .sort();

  if (dates.length === 0) return 'N/A';

  const start = dates[0];
  const end = dates[dates.length - 1];

  // Format as "Apr 2025 - Apr 2026"
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  return `${formatDate(start)} - ${formatDate(end)}`;
}

// ─── CLI setup ────────────────────────────────────────────────────────────────

const argv = await yargs(hideBin(process.argv))
  .scriptName('shapegrid')
  .command(
    'generate',
    'Generate activity grid image from GitHub contributions',
    y => y
      .option('config', { alias: 'c', type: 'string', describe: 'Path to config YAML', default: 'shapegrid.config.yml' })
      .option('user', { type: 'string', describe: 'GitHub username (overrides config)' })
      .option('token', { type: 'string', describe: 'GitHub token or env var name (overrides config)' })
      .option('count', { type: 'number', describe: 'Cell count (overrides config)' })
      .option('type', { type: 'string', choices: ['square', 'hex'], describe: 'Grid type (overrides config)' }),
    async args => {
      try {
        const { config: cfg, configDir } = loadConfig(args.config);
        if (args.user)  cfg.github.username = args.user;
        if (args.token) cfg.github.token = args.token;
        if (args.count) cfg.grid.count = args.count;
        if (args.type)  cfg.grid.type = args.type as GridType;
        await runGenerate(cfg, configDir);
      } catch (e) {
        err(String(e));
        process.exit(1);
      }
    }
  )
  .demandCommand(1, 'Specify a command: generate')
  .help()
  .argv;
