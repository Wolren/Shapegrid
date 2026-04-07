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
  };
  render: {
    colorScale: ColorScale;
    heightScale: number;
    showBoundary: boolean;
    background: string;
    gap: number;
    width: number;
    height: number;
  };
  output: {
    dir: string;
    svgFilename?: string;
    pngFilename?: string;
    jsonFilename?: string;
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

function resolveToken(tokenOrEnvName: string): string {
  if (tokenOrEnvName.startsWith('ghp_') || tokenOrEnvName.startsWith('github_pat_')) {
    return tokenOrEnvName;
  }
  // Treat as environment variable name
  const val = process.env[tokenOrEnvName];
  if (!val) throw new Error(`Environment variable "${tokenOrEnvName}" is not set`);
  return val;
}

function resolveBoundary(src: BoundarySource, configDir: string): Polygon {
  if (src.type === 'file') {
    // Load file content and parse
    const filePath = resolve(configDir, src.path);
    const content = readFileSync(filePath, 'utf8');
    const format = src.format ?? (src.path.endsWith('.svg') ? 'svg' : 'geojson');
    return loadBoundaryFromContent(content, format);
  }
  return loadBoundary(src);
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

function generateSvg(data: DataExport, cfg: ShapegridConfig): string {
  const W = cfg.render.width ?? 800;
  const H = cfg.render.height ?? 400;

  // Simple isometric projection
  const ISO_YAW   = (cfg.camera.yaw   * Math.PI) / 180;
  const ISO_PITCH = (cfg.camera.pitch * Math.PI) / 180;

  // Project normalised [0,1] cell position to SVG coords
  function project(x: number, y: number, h: number): [number, number] {
    // Rotate in XZ plane by yaw, then tilt by pitch
    const rx = x - 0.5;
    const rz = y - 0.5;

    const screenX = rx * Math.cos(ISO_YAW) - rz * Math.sin(ISO_YAW);
    const worldY  = rx * Math.sin(ISO_YAW) * Math.sin(ISO_PITCH)
                  + rz * Math.cos(ISO_YAW) * Math.sin(ISO_PITCH)
                  - h  * Math.cos(ISO_PITCH);

    return [
      W / 2 + screenX * W * 0.7,
      H / 2 + worldY * H * 0.7,
    ];
  }

  function intensityToSvgColor(intensity: number): string {
    const { colorScale } = cfg.render;
    // Inline simple colour scale
    if (intensity === 0) return '#161b22';
    if (intensity < 0.25) return '#0e4429';
    if (intensity < 0.5)  return '#006d32';
    if (intensity < 0.75) return '#26a641';
    return '#39d353';
  }

  const cells = data.grid.cells.map(cell => {
    const s = data.grid.cellSize * (1 - (cfg.render.gap ?? 0.08)) * 0.5;
    const maxH = 0.12 * (cfg.render.heightScale ?? 1);
    const h = Math.max(0.005, cell.intensity * maxH);
    const [px, py] = project(cell.cx, cell.cy, h);

    if (data.grid.type === 'square') {
      return `<rect
        x="${(px - s * W * 0.35).toFixed(1)}"
        y="${(py - s * H * 0.35).toFixed(1)}"
        width="${(s * W * 0.7).toFixed(1)}"
        height="${(s * H * 0.7).toFixed(1)}"
        fill="${intensityToSvgColor(cell.intensity)}"
        rx="1"
      >
        <title>${cell.date}: ${cell.count} contributions</title>
      </rect>`;
    } else {
      // Hex as polygon
      const r = s * W * 0.35;
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (i * 60 - 30) * Math.PI / 180;
        return `${(px + r * Math.cos(a)).toFixed(1)},${(py + r * Math.sin(a)).toFixed(1)}`;
      }).join(' ');
      return `<polygon points="${pts}" fill="${intensityToSvgColor(cell.intensity)}">
        <title>${cell.date}: ${cell.count} contributions</title>
      </polygon>`;
    }
  });

  // Legend
  const legendItems = [0, 0.25, 0.5, 0.75, 1.0].map((t, i) => {
    const col = intensityToSvgColor(t);
    return `<rect x="${W - 100 + i * 16}" y="${H - 22}" width="12" height="12" fill="${col}" rx="2"/>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${cfg.render.background ?? '#0d1117'}"/>
  <g id="cells">
    ${cells.join('\n    ')}
  </g>
  <g id="legend">
    <text x="${W - 105}" y="${H - 10}" fill="#8b949e" font-family="monospace" font-size="10">Less</text>
    ${legendItems}
    <text x="${W - 20}" y="${H - 10}" fill="#8b949e" font-family="monospace" font-size="10">More</text>
  </g>
  <text x="12" y="${H - 10}" fill="#8b949e" font-family="monospace" font-size="10">
    @${data.username} · ${data.totalContributions} contributions · generated by shapegrid
  </text>
</svg>`;
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
      .option('type', { type: 'string', choices: ['square', 'hex'], describe: 'Grid type (overrides config)' })
      .option('country', { type: 'string', describe: 'Country code (ISO 3166-1 alpha-2) for boundary shape' })
      .option('boundary-file', { type: 'string', describe: 'Path to GeoJSON or SVG boundary file' }),
    async args => {
      try {
        const { config: cfg, configDir } = loadConfig(args.config);
        if (args.user)  cfg.github.username = args.user;
        if (args.token) cfg.github.token = args.token;
        if (args.count) cfg.grid.count = args.count;
        if (args.type)  cfg.grid.type = args.type as GridType;
        if (args.country) {
          cfg.boundary = { type: 'country', code: args.country };
        }
        if (args['boundary-file']) {
          cfg.boundary = { type: 'file', path: args['boundary-file'] };
        }
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
