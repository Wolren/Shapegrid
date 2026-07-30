// ══════════════════════════════════════════════════════════════════════════════
// Application state management
// ══════════════════════════════════════════════════════════════════════════════

import type { AppState } from '../types';
import { createPresets } from '../data/presets';
import { norm } from '../geometry/projection';
import { defaultEditorState } from './editor-state';
import { getDefaultDashboard } from './dashboard';

// Initialize presets after norm is available
const PRESETS = createPresets(norm);

export const state: AppState = {
  poly: PRESETS.circle,
  preset: 'circle',
  country: null,
  boundaryType: 'preset',
  fileContent: null,
  fileName: null,
  fileType: null,
  geoBounds: null,
  coordSystem: null,
  gridType: 'hex',
  count: 365,
  gap: 0.08,
  coverage: 0.3,
  showBoundary: false,
  showCoordAxes: true,
  coordAxesScale: 1.0,
  coordAxesPosition: 'outside',
  coordAxesOffset: 0.04,
  coordAxesXOffset: 0.04,
  coordAxesYOffset: 0.04,
  coordAxesTickLength: 0.015,
  coordAxesLabelOffset: 0.03,
  coordAxesLineColor: '#666666',
  coordAxesLabelColor: '#888888',
  yaw: 30,
  pitch: 45,
  zoom: 1.3,
  heightScale: 1.0,
  background: '#0d1117',
  palette: 'ocean',
  daysMode: 'last',
  selectedYears: new Set([new Date().getFullYear()]),
  contributions: null,
  grid: null,
  cellData: [],
  overlay: {
    legendPos: { x: 2, y: 86 },
    statsPos: { x: 82, y: 1 },
    showLegend: true,
    showStats: true,
    legendFontSize: 10,
    legendBarWidth: 80,
    statsFontSize: 10,
    statsInline: false,
  },
  dashboard: getDefaultDashboard(),
  languages: [],
  editor: { ...defaultEditorState },
};

export function updateState<K extends keyof AppState>(key: K, value: AppState[K]) {
  state[key] = value;
}

export function getPresets() {
  return PRESETS;
}

export function setPreset(name: string) {
  if (PRESETS[name]) {
    state.poly = PRESETS[name];
    state.preset = name;
    state.boundaryType = 'preset';
  }
}
