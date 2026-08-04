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
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { generateSvg, type DataExport } from './svg-render.js';

import {
  loadBoundary,
  loadBoundaryFromContent,
  generateGrid,
  fetchContributions,
  fetchLanguages,
  mapContributionsToCells,
  lastNDays,
  intensityToColor,
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
  axes?: {
    enabled?: boolean;           // show coordinate axes (default: auto-detect from coordSystem)
    position?: 'outside' | 'inside'; // axis position relative to grid (default: 'outside')
    distance?: number;           // distance from grid edge (0.01-0.2, default: 0.06)
    lineColor?: string;          // axis line color (default: '#666666')
    labelColor?: string;         // axis label color (default: '#888888')
    labelFont?: string;          // font family (default: 'IBM Plex Mono, monospace')
    labelScale?: number;         // label size scale (default: 1.0)
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
  customPos?: { x: number; y: number } | null;
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
    return loadBoundaryFromContent(content, format, src.coordinateSystem ?? 'auto');
  }
  return loadBoundary(src);
}

function log(msg: string) { console.log(chalk.cyan('[shapegrid]'), msg); }
function ok(msg: string)  { console.log(chalk.green('  ✓'), msg); }
function err(msg: string) { console.error(chalk.red('  ✗'), msg); }

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

  // 3b. Fetch language breakdown when the languages widget is enabled
  let languages: { name: string; color: string; percentage: number }[] = [];
  const wantsLanguages = cfg.dashboard?.widgets?.some(w => w.id === 'languages' && w.visible !== false);
  if (wantsLanguages) {
    log(`Fetching language breakdown for @${username}…`);
    languages = await fetchLanguages(username, token);
    ok(`${languages.length} languages`);
  }

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
    days: contributions.days.map(d => ({ date: d.date, contributionCount: d.contributionCount })),
    languages,
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
        if (args.count !== undefined && args.count !== null) cfg.grid.count = args.count;
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
