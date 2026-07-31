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
import { generateSvg } from './svg-render.js';
import { loadBoundary, loadBoundaryFromContent, generateGrid, fetchContributions, mapContributionsToCells, lastNDays, } from '@shapegrid/core';
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