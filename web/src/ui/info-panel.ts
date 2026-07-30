// ══════════════════════════════════════════════════════════════════════════════
// Floating info panel — cell details, grid summary, selection count
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { getEditor } from './editor-state';
import { intensityToColor, activePaletteId } from '../rendering/colors';

let panelEl: HTMLElement | null = null;
let isDragging = false;
let dragOffX = 0, dragOffY = 0;

// ── DOM Builder ─────────────────────────────────────────────────────────────

function buildPanel(): HTMLElement {
  const p = document.createElement('div');
  p.id = 'info-panel';
  p.style.cssText = `
    position: absolute;
    bottom: 8px;
    right: 8px;
    width: 220px;
    background: rgba(13, 17, 23, 0.82);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1px solid rgba(48, 54, 61, 0.6);
    border-radius: 6px;
    padding: 0;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    color: #e6edf3;
    z-index: 25;
    user-select: none;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    display: none;
    overflow: hidden;
  `;

  // ── Title bar (draggable) ─────────────────────────────────────────────────
  const titleBar = document.createElement('div');
  titleBar.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px 6px 10px;
    background: rgba(22, 27, 34, 0.9);
    border-bottom: 1px solid rgba(48, 54, 61, 0.4);
    cursor: grab;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #8b949e;
    font-weight: 500;
  `;

  const dragHandle = document.createElement('span');
  dragHandle.style.cssText = `margin-right: auto; letter-spacing: 0.2em;`;
  dragHandle.textContent = '⣿ Info Panel';
  titleBar.appendChild(dragHandle);

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.style.cssText = `
    background: none; border: none; color: #8b949e;
    cursor: pointer; font-size: 14px; line-height: 1;
    padding: 0 2px; transition: color 0.15s;
  `;
  closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#f85149'; });
  closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#8b949e'; });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    getEditor().showInfoPanel = false;
    if (panelEl) panelEl.style.display = 'none';
  });
  titleBar.appendChild(closeBtn);

  // Drag behavior on title bar
  titleBar.addEventListener('mousedown', (e) => {
    if (!panelEl) return;
    isDragging = true;
    const rect = panelEl.getBoundingClientRect();
    dragOffX = e.clientX - rect.left;
    dragOffY = e.clientY - rect.top;
    panelEl.style.bottom = 'auto';
    panelEl.style.right = 'auto';
    panelEl.style.left = rect.left + 'px';
    panelEl.style.top = rect.top + 'px';
    panelEl.style.cursor = 'grabbing';
    titleBar.style.cursor = 'grabbing';
  });

  p.appendChild(titleBar);

  // ── Content body ──────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.id = 'info-panel-body';
  body.style.cssText = `
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 0;
  `;

  // Section: Cell Details
  const cellSection = document.createElement('div');
  cellSection.id = 'info-cell-section';
  cellSection.style.cssText = `
    padding-bottom: 6px;
    margin-bottom: 6px;
    border-bottom: 1px solid rgba(48, 54, 61, 0.3);
    display: none;
  `;

  const cellTitle = document.createElement('div');
  cellTitle.style.cssText = `
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #8b949e;
    margin-bottom: 4px;
    font-weight: 500;
  `;
  cellTitle.textContent = 'Cell Details';
  cellSection.appendChild(cellTitle);

  const cellDate = document.createElement('div');
  cellDate.id = 'info-cell-date';
  cellDate.style.cssText = `margin-bottom: 2px;`;
  cellSection.appendChild(cellDate);

  const cellCount = document.createElement('div');
  cellCount.id = 'info-cell-count';
  cellCount.style.cssText = `margin-bottom: 2px;`;
  cellSection.appendChild(cellCount);

  // Intensity bar
  const intensityRow = document.createElement('div');
  intensityRow.style.cssText = `display: flex; align-items: center; gap: 6px; margin-bottom: 2px;`;

  const intensityLabel = document.createElement('span');
  intensityLabel.id = 'info-cell-intensity-label';
  intensityLabel.style.cssText = `color: #8b949e; min-width: 32px;`;
  intensityLabel.textContent = 'Intensity';
  intensityRow.appendChild(intensityLabel);

  const intensityBar = document.createElement('div');
  intensityBar.id = 'info-cell-intensity-bar';
  intensityBar.style.cssText = `
    height: 6px; flex: 1; border-radius: 3px;
    transition: background 0.2s;
  `;
  intensityRow.appendChild(intensityBar);
  cellSection.appendChild(intensityRow);

  const cellPos = document.createElement('div');
  cellPos.id = 'info-cell-pos';
  cellPos.style.cssText = `color: #8b949e; font-size: 9px;`;
  cellSection.appendChild(cellPos);

  body.appendChild(cellSection);

  // Section: Grid Summary
  const gridSection = document.createElement('div');
  gridSection.id = 'info-grid-section';

  const gridTitle = document.createElement('div');
  gridTitle.style.cssText = `
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #8b949e;
    margin-bottom: 4px;
    font-weight: 500;
  `;
  gridTitle.textContent = 'Grid Summary';
  gridSection.appendChild(gridTitle);

  const gridTotalCells = document.createElement('div');
  gridTotalCells.id = 'info-grid-total-cells';
  gridTotalCells.style.cssText = `margin-bottom: 2px;`;
  gridSection.appendChild(gridTotalCells);

  const gridTotalContrib = document.createElement('div');
  gridTotalContrib.id = 'info-grid-total-contrib';
  gridTotalContrib.style.cssText = `margin-bottom: 2px;`;
  gridSection.appendChild(gridTotalContrib);

  const gridAvgIntensity = document.createElement('div');
  gridAvgIntensity.id = 'info-grid-avg-intensity';
  gridAvgIntensity.style.cssText = `margin-bottom: 2px;`;
  gridSection.appendChild(gridAvgIntensity);

  const gridCoverageRange = document.createElement('div');
  gridCoverageRange.id = 'info-grid-coverage-range';
  gridCoverageRange.style.cssText = `color: #8b949e; font-size: 9px;`;
  gridSection.appendChild(gridCoverageRange);

  body.appendChild(gridSection);

  // Section: Selection count (shown when multiple cells selected)
  const selSection = document.createElement('div');
  selSection.id = 'info-selection-section';
  selSection.style.cssText = `
    padding-top: 6px;
    margin-top: 6px;
    border-top: 1px solid rgba(48, 54, 61, 0.3);
    display: none;
  `;

  const selCount = document.createElement('div');
  selCount.id = 'info-selection-count';
  selCount.style.cssText = `color: #39d353; font-weight: 500;`;
  selSection.appendChild(selCount);

  body.appendChild(selSection);

  p.appendChild(body);

  return p;
}

// ── Panel lifecycle ─────────────────────────────────────────────────────────

/** Create the info panel DOM and insert it into #canvas-wrap. Returns cleanup. */
export function initInfoPanel(): () => void {
  if (panelEl) return () => { /* already initialised */ };

  const wrap = document.getElementById('canvas-wrap');
  if (!wrap) {
    console.warn('[info-panel] #canvas-wrap not found');
    return () => {};
  }

  panelEl = buildPanel();

  // Global mouseup to stop dragging
  const onUp = () => {
    if (!isDragging || !panelEl) return;
    isDragging = false;
    panelEl.style.cursor = '';
    const titleBar = panelEl.querySelector('div') as HTMLElement;
    if (titleBar) titleBar.style.cursor = 'grab';
  };
  const onMove = (e: MouseEvent) => {
    if (!isDragging || !panelEl) return;
    const wrapRect = wrap.getBoundingClientRect();
    const x = e.clientX - wrapRect.left - dragOffX;
    const y = e.clientY - wrapRect.top - dragOffY;
    panelEl.style.left = Math.max(0, x) + 'px';
    panelEl.style.top = Math.max(0, y) + 'px';
  };

  window.addEventListener('mouseup', onUp);
  window.addEventListener('mousemove', onMove);

  wrap.appendChild(panelEl);

  // Initial visibility sync
  syncInfoPanelState();
  updateGridSummary();

  return () => {
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('mousemove', onMove);
    if (panelEl && panelEl.parentNode) {
      panelEl.parentNode.removeChild(panelEl);
    }
    panelEl = null;
  };
}

/** Update panel visibility based on editor state */
export function syncInfoPanelState(): void {
  if (!panelEl) return;
  const editor = getEditor();
  panelEl.style.display = editor.showInfoPanel ? 'block' : 'none';
}

/** Update panel content for a given hovered/selected cell index (or null for none) */
export function updateInfoPanel(idx: number | null): void {
  if (!panelEl) return;

  // Don't show if panel is hidden or editor says not to show
  const editor = getEditor();
  if (!editor.showInfoPanel) {
    panelEl.style.display = 'none';
    return;
  }

  const cellSection = document.getElementById('info-cell-section');
  const selSection = document.getElementById('info-selection-section');

  // ── Cell Details ──────────────────────────────────────────────────────────
  if (idx !== null && state.cellData[idx] && state.grid?.cells[idx]) {
    const d = state.cellData[idx];
    const cell = state.grid.cells[idx];
    const color = intensityToColor(d.intensity, activePaletteId);

    const dateEl = document.getElementById('info-cell-date');
    if (dateEl) dateEl.innerHTML = `<span style="color:#8b949e">Date</span>  ${d.date || '<span style="color:#8b949e">—</span>'}`;

    const countEl = document.getElementById('info-cell-count');
    if (countEl) countEl.innerHTML = `<span style="color:#8b949e">Count</span>  <strong>${d.count}</strong>`;

    const labelEl = document.getElementById('info-cell-intensity-label');
    if (labelEl) labelEl.textContent = `${(d.intensity * 100).toFixed(0)}%`;

    const barEl = document.getElementById('info-cell-intensity-bar');
    if (barEl) barEl.style.background = `linear-gradient(90deg, ${color}, ${color})`;

    const posEl = document.getElementById('info-cell-pos');
    if (posEl) posEl.textContent = `Pos  ${cell.cx.toFixed(2)}, ${cell.cy.toFixed(2)}`;

    if (cellSection) cellSection.style.display = 'block';
  } else {
    if (cellSection) cellSection.style.display = 'none';
  }

  // ── Grid Summary ──────────────────────────────────────────────────────────
  updateGridSummary();

  // ── Selection section ──────────────────────────────────────────────────────
  const nSel = editor.selectedCellIndices.length;
  if (nSel > 0) {
    const selCountEl = document.getElementById('info-selection-count');
    if (selCountEl) selCountEl.textContent = `${nSel} cell${nSel !== 1 ? 's' : ''} selected`;
    if (selSection) selSection.style.display = 'block';
  } else {
    if (selSection) selSection.style.display = 'none';
  }

  panelEl.style.display = 'block';
}

// ── Internal helpers ────────────────────────────────────────────────────────

function updateGridSummary(): void {
  const grid = state.grid;
  if (!grid) return;

  const totalCells = grid.cells.length;

  let totalContrib = 0;
  let sumIntensity = 0;
  let minCov = Infinity, maxCov = -Infinity;

  for (let i = 0; i < totalCells; i++) {
    const d = state.cellData[i];
    if (d) {
      totalContrib += d.count;
      sumIntensity += d.intensity;
    }
    const cell = grid.cells[i];
    if (cell) {
      if (cell.coverage < minCov) minCov = cell.coverage;
      if (cell.coverage > maxCov) maxCov = cell.coverage;
    }
  }

  const avgIntensity = totalCells > 0 ? sumIntensity / totalCells : 0;

  const totalCellsEl = document.getElementById('info-grid-total-cells');
  if (totalCellsEl) totalCellsEl.innerHTML = `<span style="color:#8b949e">Cells</span>  ${totalCells.toLocaleString()}`;

  const totalContribEl = document.getElementById('info-grid-total-contrib');
  if (totalContribEl) totalContribEl.innerHTML = `<span style="color:#8b949e">Contributions</span>  <strong>${totalContrib.toLocaleString()}</strong>`;

  const avgIntensityEl = document.getElementById('info-grid-avg-intensity');
  if (avgIntensityEl) avgIntensityEl.innerHTML = `<span style="color:#8b949e">Avg Intensity</span>  ${(avgIntensity * 100).toFixed(1)}%`;

  const coverageRangeEl = document.getElementById('info-grid-coverage-range');
  if (coverageRangeEl) {
    if (isFinite(minCov) && isFinite(maxCov)) {
      coverageRangeEl.textContent = `Coverage  ${(minCov * 100).toFixed(0)}% – ${(maxCov * 100).toFixed(0)}%`;
    } else {
      coverageRangeEl.textContent = '';
    }
  }
}
