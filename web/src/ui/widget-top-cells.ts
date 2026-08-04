// ══════════════════════════════════════════════════════════════════════════════
// Widget: Top Cells - highest-contribution cells with date + count bars
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, getWidgetSetting, widgetFontScale, widgetAccent, widgetSecondary } from './dashboard';
import type { WidgetId } from '../types';

function renderTopCells(container: HTMLElement, id: string): void {
  const accent = widgetAccent(id as WidgetId);
  const secondary = widgetSecondary(id as WidgetId);
  const maxItems = getWidgetSetting('topCells', 'maxItems', 5) as number;
  const cellData = state.cellData;
  const f = widgetFontScale('topCells');

  container.style.fontSize = (10 * f) + 'px';
  container.style.padding = '6px 8px';
  container.style.overflow = 'hidden';

  if (!cellData || cellData.length === 0) {
    container.textContent = 'No contribution data';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
    return;
  }

  // Cells with a date and a positive count, ranked by count
  const ranked = cellData
    .map((d, i) => ({ ...d, idx: i }))
    .filter(d => d.count > 0 && d.date)
    .sort((a, b) => b.count - a.count)
    .slice(0, maxItems);

  if (ranked.length === 0) {
    container.textContent = 'No contributions yet';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
    return;
  }

  const maxCount = ranked[0].count;
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '5px';

  for (const item of ranked) {
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '68px 1fr 34px';
    row.style.alignItems = 'center';
    row.style.gap = '6px';

    // Date (short: "12 Jan")
    const date = document.createElement('span');
    date.style.color = 'rgba(255,255,255,0.45)';
    date.style.fontSize = (9 * f) + 'px';
    date.style.fontFamily = 'var(--mono)';
    date.style.color = secondary;
    date.textContent = shortDate(item.date);
    row.appendChild(date);

    // Bar
    const barWrap = document.createElement('div');
    barWrap.style.height = '8px';
    barWrap.style.background = 'rgba(48,54,61,0.35)';
    barWrap.style.borderRadius = '4px';
    barWrap.style.overflow = 'hidden';

    const bar = document.createElement('div');
    bar.style.height = '100%';
    bar.style.width = Math.max((item.count / maxCount) * 100, 4) + '%';
    bar.style.background = `linear-gradient(90deg, ${accent}66, ${accent})`;
    bar.style.borderRadius = '4px';
    barWrap.appendChild(bar);
    row.appendChild(barWrap);

    // Count
    const count = document.createElement('span');
    count.style.color = accent;
    count.style.fontSize = (10 * f) + 'px';
    count.style.fontWeight = '600';
    count.style.textAlign = 'right';
    count.style.fontFamily = 'var(--mono)';
    count.textContent = String(item.count);
    row.appendChild(count);

    list.appendChild(row);
  }

  container.appendChild(list);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

registerWidget('topCells', renderTopCells);
