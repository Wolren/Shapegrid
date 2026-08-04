// ══════════════════════════════════════════════════════════════════════════════
// Data Table Panel - collapsible cell data table at the bottom of the canvas
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { getEditor, setEditor, setSelectedCells } from './editor-state';

let panel: HTMLDivElement | null = null;
let tbody: HTMLTableSectionElement | null = null;
let countEl: HTMLSpanElement | null = null;

// ── Styles (injected once) ──────────────────────────────────────────────────

const STYLE_ID = 'dt-panel-style';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    #data-table-panel { font-family: var(--mono); }
    #data-table-panel .dt-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 12px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      font-size: 10px;
      background: rgba(13, 17, 23, 0.9);
    }
    #data-table-panel .dt-header-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #data-table-panel .dt-header-label {
      color: var(--text);
      font-weight: 600;
      font-size: 10px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    #data-table-panel .dt-header-count {
      color: var(--muted);
      font-size: 9px;
    }
    #data-table-panel .dt-close {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 2px 6px;
      border-radius: 3px;
      transition: color 0.15s, background 0.15s;
      font-family: var(--mono);
    }
    #data-table-panel .dt-close:hover {
      color: var(--text);
      background: var(--surface3);
    }
    #data-table-panel .dt-scroll {
      flex: 1;
      overflow-y: auto;
      overflow-x: auto;
    }
    #data-table-panel .dt-scroll::-webkit-scrollbar {
      width: 4px; height: 4px;
    }
    #data-table-panel .dt-scroll::-webkit-scrollbar-track {
      background: transparent;
    }
    #data-table-panel .dt-scroll::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 2px;
    }
    #data-table-panel table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--mono);
      font-size: 9px;
      table-layout: fixed;
    }
    #data-table-panel thead {
      position: sticky;
      top: 0;
      z-index: 1;
    }
    #data-table-panel th {
      text-align: left;
      padding: 4px 8px;
      font-size: 8px;
      font-weight: 500;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--surface2);
      border-bottom: 1px solid var(--border);
    }
    #data-table-panel td {
      padding: 3px 8px;
      border-bottom: 1px solid rgba(48, 54, 61, 0.4);
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 9px;
      cursor: pointer;
    }
    #data-table-panel tr {
      transition: background 0.1s;
    }
    #data-table-panel tr:hover td {
      background: var(--surface3);
    }
    #data-table-panel tr.selected td {
      background: rgba(57, 211, 83, 0.12);
    }
    #data-table-panel tr.selected td:first-child {
      border-left: 2px solid var(--accent);
    }
    #data-table-panel .dt-empty {
      padding: 20px;
      text-align: center;
      color: var(--muted);
      font-size: 10px;
    }
    #data-table-panel th:nth-child(1) { width: 32px; }
    #data-table-panel th:nth-child(2) { width: 100px; }
    #data-table-panel th:nth-child(3) { width: 54px; }
    #data-table-panel th:nth-child(4) { width: 64px; }
    #data-table-panel th:nth-child(5) { width: 110px; }
    #data-table-panel td:nth-child(3),
    #data-table-panel td:nth-child(4) {
      text-align: right;
    }
    #data-table-panel td:nth-child(5) {
      font-size: 8px;
      color: var(--muted);
    }
  `;
  document.head.appendChild(s);
}

// ── DOM building ────────────────────────────────────────────────────────────

export function initDataTable(): void {
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap) return;
  if (document.getElementById('data-table-panel')) return;

  injectStyles();

  panel = document.createElement('div');
  panel.id = 'data-table-panel';

  // ── Header bar ────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'dt-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'dt-header-title';

  const title = document.createElement('span');
  title.className = 'dt-header-label';
  title.textContent = 'Cell Data';

  countEl = document.createElement('span');
  countEl.className = 'dt-header-count';

  titleWrap.appendChild(title);
  titleWrap.appendChild(countEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'dt-close';
  closeBtn.innerHTML = '&#x2715;';
  closeBtn.title = 'Close data table';
  closeBtn.addEventListener('click', () => {
    setEditor({ showDataTable: false });
    syncDataTableVisibility();
  });

  header.appendChild(titleWrap);
  header.appendChild(closeBtn);

  // ── Scrollable table ──────────────────────────────────────────────────────
  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'dt-scroll';

  const table = document.createElement('table');

  // Thead
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['#', 'Date', 'Count', 'Intensity', 'Position'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Tbody
  tbody = document.createElement('tbody');
  table.appendChild(tbody);

  scrollWrap.appendChild(table);

  // ── Assemble panel ────────────────────────────────────────────────────────
  panel.appendChild(header);
  panel.appendChild(scrollWrap);

  wrap.appendChild(panel);

  rebuildDataTable();
  syncDataTableVisibility();
}

// ── Populate table rows from current state ─────────────────────────────────

export function rebuildDataTable(): void {
  if (!panel || !tbody || !countEl) return;

  tbody.innerHTML = '';

  const grid = state.grid;
  const cells = grid?.cells;
  const cellData = state.cellData;
  const selected = getEditor().selectedCellIndices;

  if (!cells || cells.length === 0) {
    const row = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'dt-empty';
    td.colSpan = 5;
    td.textContent = 'No grid data - load contributions or generate a grid';
    row.appendChild(td);
    tbody.appendChild(row);
    countEl.textContent = '0 cells';
    return;
  }

  countEl.textContent = `${cells.length} cell${cells.length !== 1 ? 's' : ''}`;

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const data = cellData[i] || { date: '', count: 0, intensity: 0 };
    const row = document.createElement('tr');
    row.dataset.index = String(i);

    if (selected.includes(i)) {
      row.classList.add('selected');
    }

    // # (1-based index)
    const tdIdx = document.createElement('td');
    tdIdx.textContent = String(i + 1);
    row.appendChild(tdIdx);

    // Date
    const tdDate = document.createElement('td');
    tdDate.textContent = data.date || '-';
    row.appendChild(tdDate);

    // Count
    const tdCount = document.createElement('td');
    tdCount.textContent = String(data.count);
    row.appendChild(tdCount);

    // Intensity
    const tdIntensity = document.createElement('td');
    tdIntensity.textContent = data.intensity.toFixed(4);
    row.appendChild(tdIntensity);

    // Position (cx, cy)
    const tdPos = document.createElement('td');
    tdPos.textContent = `${cell.cx.toFixed(2)}, ${cell.cy.toFixed(2)}`;
    row.appendChild(tdPos);

    // Click handler - select / deselect
    row.addEventListener('click', () => {
      const currentSelected = getEditor().selectedCellIndices;
      const already = currentSelected.includes(i);
      if (already) {
        setSelectedCells([]);
      } else {
        setSelectedCells([i]);
      }
      // Rebuild to reflect selection
      rebuildDataTable();
    });

    tbody.appendChild(row);
  }
}

// ── Visibility sync ────────────────────────────────────────────────────────

export function syncDataTableVisibility(): void {
  if (!panel) return;
  panel.style.display = getEditor().showDataTable ? 'flex' : 'none';
  panel.style.flexDirection = 'column';
}
