// ══════════════════════════════════════════════════════════════════════════════
// Data loading, demo data, and CI-generated JSON ingestion
// ══════════════════════════════════════════════════════════════════════════════

import { state, updateState } from './state';
import { fetchContributions } from './github';
import { generateGrid } from '../geometry/engine';
import { scheduleRebuild } from './rebuild';
import type { DataExport, GridResult, Cell, CellData, GitHubDay } from '../types';

// Safe textContent setter — guard against removed DOM elements
function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

export async function loadData(): Promise<void> {
  const user = (document.getElementById('inp-user') as HTMLInputElement).value.trim();
  const token = (document.getElementById('inp-token') as HTMLInputElement).value.trim();
  if (!user || !token) {
    setStatus('Enter username and token', 'error');
    return;
  }

  const days = parseFloat((document.getElementById('inp-days') as HTMLInputElement).value);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);

  setStatus('Fetching contributions\u2026', '');
  (document.getElementById('btn-fetch') as HTMLButtonElement).disabled = true;

  try {
    const contrib = await fetchContributions(user, start, end, token);
    updateState('contributions', contrib);
    setText('stat-contrib', contrib.total.toLocaleString());

    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const filtered = contrib.days.filter(d => d.date >= startStr && d.date <= endStr);
    const maxC = Math.max(1, ...filtered.map(d => d.contributionCount));

    computeGrid();

    const N = state.grid?.cells.length || state.count;
    updateState('cellData', Array.from({ length: N }, (_, i) => {
      const d = filtered[i];
      return d
        ? { date: d.date, count: d.contributionCount, intensity: d.contributionCount / maxC }
        : { date: '', count: 0, intensity: 0 };
    }));

    setStatus(`\u2713 ${contrib.total} contributions \u00b7 @${user}`, 'ok');
    scheduleRebuild();
    setText('footer-gen', `generated ${new Date().toLocaleDateString()}`);
  } catch (e: any) {
    setStatus(e.message, 'error');
  } finally {
    (document.getElementById('btn-fetch') as HTMLButtonElement).disabled = false;
  }
}

export function computeGrid(): void {
  updateState('grid', generateGrid(state.poly, { count: state.count, type: state.gridType, thr: state.coverage }));
  setText('stat-cells', String(state.grid!.cells.length));
}

export function setStatus(msg: string, cls: string): void {
  const el = document.getElementById('status-line');
  if (!el) return;
  el.textContent = msg;
  el.className = cls || '';
}

export function loadDemo(): void {
  // Preserve real contributions when they exist — don't overwrite with noise
  if (state.contributions && state.contributions.username !== 'demo' && state.contributions.days.length > 0) {
    return;
  }
  // If data was loaded from CI JSON (no per-day data), preserve cell data
  if (state.contributions && state.contributions.username !== 'demo' && state.cellData.length > 0) {
    return;
  }
  const N = state.count;
  const max = 15;
  // Demo data carries real dates so date-driven widgets (Top Cells, Weekday,
  // Timeline, Activity) show meaningful content instead of empty states.
  const days: GitHubDay[] = [];
  const today = new Date();
  const cellData = Array.from({ length: N }, (_, i) => {
    const noise = Math.sin(i * 0.3) * Math.cos(i * 0.07) * 0.5 + 0.5;
    const count = Math.round(noise * max);
    const d = new Date(today);
    d.setDate(today.getDate() - (N - 1 - i));
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, contributionCount: count, color: '', weekday: d.getDay() });
    return { date: iso, count, intensity: count / max };
  });
  updateState('cellData', cellData);
  updateState('contributions', {
    username: 'demo',
    total: state.cellData.reduce((s, d) => s + d.count, 0),
    days,
  });
  setText('stat-contrib', state.contributions!.total.toLocaleString());
}

/**
 * Lightweight shape validation for untrusted config JSON (user file or URL).
 * Throws a descriptive Error when the payload is not a usable DataExport.
 */
function validateDataExport(data: any): asserts data is DataExport {
  if (!data || typeof data !== 'object') throw new Error('Invalid config: not an object');
  if (!data.grid || typeof data.grid !== 'object') throw new Error('Invalid config: missing grid');
  if (!Array.isArray(data.grid.cells)) throw new Error('Invalid config: grid.cells must be an array');
  if (typeof data.grid.cellSize !== 'number' || !isFinite(data.grid.cellSize)) {
    throw new Error('Invalid config: grid.cellSize must be a number');
  }
  if (data.grid.type !== 'square' && data.grid.type !== 'hex') {
    throw new Error('Invalid config: grid.type must be "square" or "hex"');
  }
  for (const c of data.grid.cells) {
    if (!c || typeof c.cx !== 'number' || typeof c.cy !== 'number' ||
        !isFinite(c.cx) || !isFinite(c.cy)) {
      throw new Error('Invalid config: every cell needs finite numeric cx/cy');
    }
    if (c.count !== undefined && (typeof c.count !== 'number' || !isFinite(c.count))) {
      throw new Error('Invalid config: cell count must be a finite number');
    }
    if (c.date !== undefined && typeof c.date !== 'string') {
      throw new Error('Invalid config: cell date must be a string');
    }
  }
  if (typeof data.grid.count !== 'number' || !isFinite(data.grid.count) || data.grid.count <= 0) {
    throw new Error('Invalid config: grid.count must be a positive number');
  }
  if (!Array.isArray(data.boundary) || data.boundary.length < 3) {
    throw new Error('Invalid config: boundary must be a polygon with 3+ points');
  }
  for (const p of data.boundary) {
    if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number') {
      throw new Error('Invalid config: boundary points must be [x, y] pairs');
    }
  }
  if (data.config !== undefined && (typeof data.config !== 'object' || data.config === null)) {
    throw new Error('Invalid config: config must be an object');
  }
  if (data.totalContributions !== undefined && typeof data.totalContributions !== 'number') {
    throw new Error('Invalid config: totalContributions must be a number');
  }
}

/**
 * Load grid data from a CI-generated DataExport JSON object.
 * Sets boundary, grid, cell data, camera, and render settings.
 */
export function loadFromJson(data: DataExport): void {
  validateDataExport(data);

  // Boundary
  updateState('poly', data.boundary);
  updateState('boundaryType', 'file');
  updateState('coordSystem', data.coordSystem ?? 'planar');
  if (data.geoBounds) {
    updateState('geoBounds', data.geoBounds);
  }

  // Grid
  const cells: Cell[] = data.grid.cells.map(c => ({
    cx: c.cx,
    cy: c.cy,
    col: 0,
    row: 0,
    coverage: 1,
  }));
  const gridResult: GridResult = {
    cells,
    cellSize: data.grid.cellSize,
    gridType: data.grid.type,
  };
  updateState('grid', gridResult);
  updateState('gridType', data.grid.type);

  // Cell data
  const cellData: CellData[] = data.grid.cells.map(c => ({
    date: c.date,
    count: c.count,
    intensity: c.intensity,
  }));
  updateState('cellData', cellData);

  // Count — sync both state and UI inputs
  updateState('count', data.grid.count);
  const daysSlider = document.getElementById('inp-days') as HTMLInputElement;
  const daysNum = document.getElementById('inp-days-num') as HTMLInputElement;
  const countNum = document.getElementById('inp-count-num') as HTMLInputElement;
  if (daysSlider) daysSlider.value = String(data.grid.count);
  if (daysNum) daysNum.value = String(data.grid.count);
  if (countNum) countNum.value = String(data.grid.count);
  setText('val-days', String(data.grid.count));

  // Grid type dropdown
  const gridTypeSelect = document.getElementById('inp-grid-type') as HTMLSelectElement;
  if (gridTypeSelect) gridTypeSelect.value = data.grid.type;

  // Camera
  if (data.config?.camera) {
    updateState('yaw', data.config.camera.yaw ?? 30);
    updateState('pitch', data.config.camera.pitch ?? 45);
    const yawSlider = document.getElementById('inp-yaw') as HTMLInputElement;
    const pitchSlider = document.getElementById('inp-pitch') as HTMLInputElement;
    if (yawSlider) yawSlider.value = String(data.config.camera.yaw ?? 30);
    if (pitchSlider) pitchSlider.value = String(data.config.camera.pitch ?? 45);
  }

  // Render settings
  if (data.config?.render) {
    updateState('heightScale', data.config.render.heightScale ?? 1);
    updateState('showBoundary', data.config.render.showBoundary ?? false);
    updateState('background', data.config.render.background ?? '#0d1117');
    updateState('gap', data.config.render.gap ?? 0.08);
  }

  // Theme
  if (data.config?.theme?.palette) {
    updateState('palette', data.config.theme.palette);
  }

  // Stats
  updateState('contributions', {
    username: data.username,
    total: data.totalContributions,
    days: [],
  });
  setText('stat-contrib', (data.totalContributions ?? 0).toLocaleString());
  setText('stat-cells', String(data.grid.cells.length));
  setText('footer-gen', `generated ${new Date(data.generated).toLocaleDateString()}`);
}

/**
 * Try to load CI-generated data from a URL (e.g. assets/shapegrid-data.json).
 * Returns true if loaded successfully, false if the file was not found.
 */
export async function loadFromUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const data: DataExport = await res.json();
    loadFromJson(data);
    return true;
  } catch {
    return false;
  }
}

export { scheduleRebuild };
