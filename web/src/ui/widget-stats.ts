// ══════════════════════════════════════════════════════════════════════════════
// Widget: Statistics — visual metrics with distribution bar
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, widgetFontScale, widgetAccent } from './dashboard';
import type { WidgetId } from '../types';
import { activePaletteId, intensityToColor } from '../rendering/colors';

function renderStats(container: HTMLElement, id: string): void {
  const accent = widgetAccent(id as WidgetId);
  const c = state.contributions;
  const grid = state.grid;
  const cellData = state.cellData;
  const total = c?.total ?? 0;
  const cellCount = grid?.cells?.length ?? 0;
  const username = c?.username || 'n/a';
  const maxCount = cellData.length > 0 ? Math.max(...cellData.map(d => d.count)) : 0;
  const activeDays = cellData.filter(d => d.count > 0).length;
  const consistency = cellCount > 0 ? (activeDays / cellCount * 100) : 0;
  const low = cellData.filter(d => d.intensity > 0 && d.intensity <= 0.33).length;
  const med = cellData.filter(d => d.intensity > 0.33 && d.intensity <= 0.66).length;
  const high = cellData.filter(d => d.intensity > 0.66).length;
  const f = widgetFontScale('stats');

  // Big numbers row
  const bigRow = document.createElement('div');
  bigRow.style.cssText = 'display:flex;gap:16px;margin-bottom:6px';
  const makeBig = (val: string, label: string) => {
    const g = document.createElement('div');
    const valDiv = document.createElement('div');
    valDiv.style.cssText = `font-size:${18 * f}px;font-weight:700;color:${accent};line-height:1.2`;
    valDiv.textContent = val;
    const labelDiv = document.createElement('div');
    labelDiv.style.cssText = `font-size:${8 * f}px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em`;
    labelDiv.textContent = label;
    g.appendChild(valDiv);
    g.appendChild(labelDiv);
    return g;
  };
  bigRow.appendChild(makeBig(total.toLocaleString(), 'Contributions'));
  bigRow.appendChild(makeBig(cellCount.toLocaleString(), 'Cells'));
  bigRow.appendChild(makeBig(`${Math.round(consistency)}%`, 'Consistency'));
  container.appendChild(bigRow);

  // Detail row
  const detailRow = document.createElement('div');
  detailRow.style.cssText = `display:flex;gap:12px;font-size:${9 * f}px;color:var(--muted);margin-bottom:6px`;
  const userSpan = document.createElement('span');
  userSpan.textContent = `User: ${username}`;
  const maxSpan = document.createElement('span');
  maxSpan.textContent = `Max: ${maxCount.toLocaleString()}`;
  const avgSpan = document.createElement('span');
  avgSpan.textContent = `Avg: ${cellCount > 0 ? (total/cellCount).toFixed(1) : '0'}/d`;
  detailRow.appendChild(userSpan);
  detailRow.appendChild(maxSpan);
  detailRow.appendChild(avgSpan);
  container.appendChild(detailRow);

  // Intensity distribution bar
  const totalBars = low + med + high || 1;
  const distBar = document.createElement('div');
  distBar.style.cssText = 'display:flex;height:5px;border-radius:3px;overflow:hidden;margin-top:2px';
  const segs = [
    { pct: low / totalBars, color: intensityToColor(0.16, activePaletteId) },
    { pct: med / totalBars, color: intensityToColor(0.5, activePaletteId) },
    { pct: high / totalBars, color: intensityToColor(0.83, activePaletteId) },
  ];
  segs.forEach(s => {
    if (s.pct > 0) {
      const seg = document.createElement('div');
      seg.style.cssText = `width:${s.pct*100}%;height:100%;background:${s.color}`;
      distBar.appendChild(seg);
    }
  });
  container.appendChild(distBar);

  const distLabels = document.createElement('div');
  distLabels.style.cssText = `display:flex;justify-content:space-between;font-size:${8 * f}px;color:var(--muted);margin-top:2px`;
  const lowSpan = document.createElement('span');
  lowSpan.textContent = `Low ${low}`;
  const medSpan = document.createElement('span');
  medSpan.textContent = `Med ${med}`;
  const highSpan = document.createElement('span');
  highSpan.textContent = `High ${high}`;
  distLabels.appendChild(lowSpan);
  distLabels.appendChild(medSpan);
  distLabels.appendChild(highSpan);
  container.appendChild(distLabels);
}

export function updateStatsWidget(): void { /* handled by renderAllWidgets */ }
registerWidget('stats', renderStats);
