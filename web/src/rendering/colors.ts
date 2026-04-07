// ══════════════════════════════════════════════════════════════════════════════
// Color palettes and color utilities
// ══════════════════════════════════════════════════════════════════════════════

import type { Palette } from '../types';

export const PALETTES: Record<string, Palette> = {
  github: { name: 'GitHub', colors: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'] },
  warm:   { name: 'Warm',   colors: ['#1a0a00', '#7a2e00', '#c05000', '#e88030', '#ffe0b0'] },
  cool:   { name: 'Cool',   colors: ['#0a0a1a', '#0d3060', '#1560a8', '#40a0e0', '#b0e0ff'] },
  mono:   { name: 'Mono',   colors: ['#1a1a1a', '#3a3a3a', '#666666', '#a0a0a0', '#e0e0e0'] },
  neon:   { name: 'Neon',   colors: ['#050510', '#1a0040', '#4400cc', '#8800ff', '#cc44ff'] },
  forest: { name: 'Forest', colors: ['#0d1a0d', '#1a3d1a', '#2d6e2d', '#4caf50', '#a8e6a3'] },
  sunset: { name: 'Sunset', colors: ['#1a0010', '#6b0030', '#c0005a', '#ff4090', '#ffb0d0'] },
  ocean:  { name: 'Ocean',  colors: ['#000d1a', '#003060', '#0070b0', '#00aad0', '#80e8ff'] },
  fire:   { name: 'Fire',   colors: ['#1a0000', '#6b1000', '#c04000', '#ff8000', '#ffee00'] },
  pastel: { name: 'Pastel', colors: ['#1a1a2e', '#6a4c93', '#c9a0dc', '#f4c6e0', '#fff5f0'] },
  arctic: { name: 'Arctic', colors: ['#001020', '#003080', '#0080d0', '#60c8f0', '#e0f8ff'] },
  gold:   { name: 'Gold',   colors: ['#1a1200', '#5a3c00', '#b07000', '#e0a800', '#ffe060'] },
};

export let activePaletteId = 'github';
export let editingSwatchIdx = 0;
export let editPaletteColors = [...PALETTES[activePaletteId].colors];

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

export function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a), [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t),
        g = Math.round(ag + (bg - ag) * t),
        bl = Math.round(ab + (bb - ab) * t);
  return '#' + [r, g, bl].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function intensityToColor(intensity: number, paletteId: string): string {
  const p = PALETTES[paletteId] || PALETTES.github;
  const c = p.colors;
  if (intensity <= 0) return c[0];
  const idx = Math.min(Math.floor(intensity * (c.length - 1)), c.length - 2);
  const t = intensity * (c.length - 1) - idx;
  return lerpHex(c[idx], c[idx + 1], t);
}

export function colToHex(css: string): [number, number, number] {
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const ctx = c.getContext('2d')!; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

export function setActivePalette(id: string) {
  activePaletteId = id;
  editPaletteColors = [...PALETTES[id].colors];
}

export function updatePaletteColors(id: string, colors: string[]) {
  PALETTES[id] = { ...PALETTES[id], colors };
  if (id === activePaletteId) {
    editPaletteColors = [...colors];
  }
}

export function addPalette(name: string, colors: string[]): string {
  const id = 'custom_' + Date.now();
  PALETTES[id] = { name, colors };
  return id;
}

export function deletePalette(id: string) {
  delete PALETTES[id];
  if (activePaletteId === id) {
    activePaletteId = 'github';
    editPaletteColors = [...PALETTES.github.colors];
  }
}

export function buildLegend() {
  const cont = document.getElementById('legend-swatches');
  if (!cont) return;
  cont.innerHTML = '';
  [0, .25, .5, .75, 1].forEach(t => {
    const d = document.createElement('div');
    d.className = 'legend-cell';
    d.style.background = intensityToColor(t, activePaletteId);
    cont.appendChild(d);
  });
}
