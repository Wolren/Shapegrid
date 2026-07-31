// ══════════════════════════════════════════════════════════════════════════════
// Widget: Cell Info — Hover/selection details panel
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, widgetFontScale } from './dashboard';
import { getEditor } from './editor-state';
import { activePaletteId, intensityToColor } from '../rendering/colors';

let _bodyEl: HTMLElement | null = null;

function renderCellInfo(container: HTMLElement, _id: string): void {
  // Always update body element reference — container is rebuilt on each renderAllWidgets
  _bodyEl = container;
  container.id = 'cell-info-body';
  container.style.padding = '6px 8px';
  container.style.minHeight = '36px';
  container.style.fontSize = widgetFontScale('cellInfo') * 10 + 'px';

  // Always update content
  populateCellInfo();
}

function populateCellInfo(): void {
  const body = _bodyEl;
  if (!body) return;
  const f = widgetFontScale('cellInfo');
  const editor = getEditor();
  const indices = editor.selectedCellIndices;
  const grid = state.grid;
  const cellData = state.cellData ?? [];

  if (indices.length === 0 || !grid?.cells) {
    const empty = document.createElement('div');
    empty.className = 'dw-cell-empty';
    empty.textContent = 'Hover over a cell';
    body.replaceChildren(empty);
    return;
  }

  body.innerHTML = '';
  body.style.display = 'block';

  for (const idx of indices.slice(0, 5)) {
    const cell = grid.cells[idx];
    if (!cell) continue;
    const data = cellData[idx];
    const date = data?.date || 'n/a';
    const count = data?.count || 0;
    const intensity = data?.intensity || 0;

    const entry = document.createElement('div');
    entry.style.marginBottom = indices.length > 1 ? '4px' : '0';

    // Date + position
    const line1 = document.createElement('div');
    line1.style.display = 'flex';
    line1.style.justifyContent = 'space-between';
    line1.style.alignItems = 'center';
    const dateSpan = document.createElement('span');
    dateSpan.style.cssText = 'color:#e6edf3;font-weight:600';
    dateSpan.textContent = date;
    const posSpan = document.createElement('span');
    posSpan.style.cssText = `color:rgba(255,255,255,0.45);font-size:${9 * f}px`;
    posSpan.textContent = `(${cell.col},${cell.row})`;
    line1.appendChild(dateSpan);
    line1.appendChild(posSpan);
    entry.appendChild(line1);

    // Count + intensity bar
    const line2 = document.createElement('div');
    line2.style.display = 'flex';
    line2.style.alignItems = 'center';
    line2.style.gap = '6px';
    line2.style.marginTop = '2px';

    const countLabel = document.createElement('span');
    countLabel.textContent = count.toLocaleString();
    countLabel.style.cssText = 'color:#e6edf3;font-weight:600;font-variant-numeric:tabular-nums;min-width:28px';

    const barOuter = document.createElement('div');
    barOuter.style.cssText = 'flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden';
    const barInner = document.createElement('div');
    barInner.style.width = `${Math.min(intensity * 100, 100)}%`;
    barInner.style.height = '100%';
    barInner.style.background = intensityToColor(intensity, activePaletteId);
    barInner.style.borderRadius = '3px';
    barOuter.appendChild(barInner);

    line2.appendChild(countLabel);
    line2.appendChild(barOuter);
    entry.appendChild(line2);
    body.appendChild(entry);
  }

  if (indices.length > 5) {
    const more = document.createElement('div');
    more.textContent = `+${indices.length - 5} more`;
    more.style.cssText = `color:rgba(255,255,255,0.45);font-size:${9 * f}px;margin-top:4px`;
    body.appendChild(more);
  }
}

export function updateCellInfoWidget(): void {
  populateCellInfo();
}

registerWidget('cellInfo', renderCellInfo);
