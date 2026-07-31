// ══════════════════════════════════════════════════════════════════════════════
// Widget: Legend — proper GIS color gradient bar
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, widgetFontScale, widgetAccent } from './dashboard';
import { activePaletteId, PALETTES } from '../rendering/colors';

function renderLegend(container: HTMLElement, _id: string): void {
  const accent = widgetAccent('legend');
  const palette = PALETTES[activePaletteId] || PALETTES.github;
  const maxVal = state.contributions?.total ?? state.cellData.reduce((m, d) => Math.max(m, d.count), 0);
  const minVal = 0;
  const f = widgetFontScale('legend');

  // Frame wrapper for the whole legend
  const legendFrame = document.createElement('div');
  legendFrame.style.cssText = 'display:flex;flex-direction:column;gap:4px';

  // Title
  const title = document.createElement('div');
  title.style.cssText = `font-size:${9 * f}px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;font-family:var(--mono);margin-bottom:2px`;
  title.textContent = 'Contributions';
  legendFrame.appendChild(title);

  // Color gradient bar — thicker GIS style
  const bar = document.createElement('div');
  bar.style.cssText = 'height:20px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,0.3)';
  bar.style.background = `linear-gradient(to right, ${palette.colors.join(', ')})`;
  legendFrame.appendChild(bar);

  // Labels row
  const labels = document.createElement('div');
  labels.style.cssText = `display:flex;justify-content:space-between;font-size:${10 * f}px;font-family:var(--mono);color:var(--text)`;
  const minLabel = document.createElement('span');
  minLabel.textContent = minVal.toLocaleString();
  const midLabel = document.createElement('span');
  midLabel.style.cssText = `color:var(--muted);font-size:${9 * f}px`;
  midLabel.textContent = 'per day';
  const maxLabel = document.createElement('span');
  maxLabel.style.fontWeight = '600';
  maxLabel.style.color = accent;
  maxLabel.textContent = maxVal.toLocaleString();
  labels.appendChild(minLabel);
  labels.appendChild(midLabel);
  labels.appendChild(maxLabel);
  legendFrame.appendChild(labels);

  container.appendChild(legendFrame);
}

registerWidget('legend', renderLegend);
