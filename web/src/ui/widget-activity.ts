// ══════════════════════════════════════════════════════════════════════════════
// Widget: Activity — GitHub-style contribution mini-grid heatmap
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, getWidgetSetting, renderAllWidgets, widgetFontScale, widgetSecondary, widgetAccent, accentRamp } from './dashboard';

// Column mapping: GitHub weekday (0=Sun, 1=Mon … 6=Sat) → grid col (Mon=0..Sun=6)
const WDAY_TO_COL: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

const MONTH_NAMES: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

function renderActivity(container: HTMLElement, _id: string): void {
  const numDays = getWidgetSetting('activity', 'days', 49) as number;
  const contribs = state.contributions;
  const allDays = contribs?.days ?? [];
  const ramp = accentRamp(widgetAccent('activity'), 5);
  const f = widgetFontScale('activity');
  const secondary = widgetSecondary('activity');

  container.style.fontSize = (10 * f) + 'px';
  container.style.padding = '6px 8px';

  if (allDays.length === 0) {
    container.textContent = 'No activity data';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
    return;
  }

  // Take the last N days (chronological order, oldest first)
  const recentDays = allDays.slice(-Math.min(numDays, allDays.length));

  // Find max contribution count for normalization
  const maxCount = recentDays.reduce((m, d) => Math.max(m, d.contributionCount), 0);

  // Determine grid dimensions
  const firstDay = recentDays[0];
  const firstCol = WDAY_TO_COL[firstDay.weekday] ?? 0;
  const totalSlots = firstCol + recentDays.length;
  const numWeeks = Math.ceil(totalSlots / 7);

  // Cell geometry
  const cellSize = 6;
  const gap = 2;
  const step = cellSize + gap;

  // Layout
  const gridW = 7 * step - gap;
  const gridH = numWeeks * step - gap;
  const labelW = 24;
  const padL = 4;
  const padT = 3;
  const svgW = padL + labelW + gridW + padL;
  const svgH = padT + gridH + padT;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', `${svgW}`);
  svg.setAttribute('height', `${svgH}`);
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.style.display = 'block';

  // Build cell grid
  for (let i = 0; i < recentDays.length; i++) {
    const day = recentDays[i];
    const col = (firstCol + i) % 7;
    const row = Math.floor((firstCol + i) / 7);

    const x = padL + labelW + col * step;
    const y = padT + row * step;

    const intensity = maxCount > 0 ? day.contributionCount / maxCount : 0;
    const color = countToPaletteColor(intensity, ramp);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', `${x}`);
    rect.setAttribute('y', `${y}`);
    rect.setAttribute('width', `${cellSize}`);
    rect.setAttribute('height', `${cellSize}`);
    rect.setAttribute('fill', color);
    rect.setAttribute('rx', '1');
    svg.appendChild(rect);
  }

  // Month labels on the left edge
  let lastMonth = '';
  for (let i = 0; i < recentDays.length; i++) {
    const m = recentDays[i].date.substring(5, 7);
    if (m !== lastMonth) {
      const row = Math.floor((firstCol + i) / 7);
      const label = MONTH_NAMES[m] ?? m;
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', `${padL}`);
      txt.setAttribute('y', `${padT + row * step + cellSize - 1}`);
      txt.setAttribute('fill', `${secondary}73`);
      txt.setAttribute('font-size', (7 * f).toFixed(1));
      txt.setAttribute('font-family', 'ui-monospace, SFMono-Regular, monospace');
      txt.textContent = label;
      svg.appendChild(txt);
      lastMonth = m;
    }
  }

  container.appendChild(svg);
}

/** Map a [0,1] intensity to one of the accent ramp colours (discrete stepped). */
function countToPaletteColor(intensity: number, palette: string[]): string {
  if (intensity <= 0 || palette.length === 0) return palette[0] ?? '#161b22';
  const idx = Math.min(Math.floor(intensity * (palette.length - 1)), palette.length - 2);
  return palette[idx] ?? palette[palette.length - 1];
}

registerWidget('activity', renderActivity);

export function updateActivityWidget(): void {
  renderAllWidgets();
}
