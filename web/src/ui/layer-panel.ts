// ══════════════════════════════════════════════════════════════════════════════
// Layer Panel — floating layer visibility toggle panel
// ══════════════════════════════════════════════════════════════════════════════

import { getEditor, setLayerVisible, clearMeasurements } from './editor-state';
import { scheduleRebuild } from './rebuild';
import type { LayerVisibility } from '../types';

let panel: HTMLDivElement | null = null;
const checkboxes = new Map<keyof LayerVisibility, HTMLInputElement>();

// ── Layer definitions ───────────────────────────────────────────────────────

interface LayerDef {
  key: keyof LayerVisibility;
  label: string;
}

const LAYERS: LayerDef[] = [
  { key: 'boundary', label: 'Boundary' },
  { key: 'grid', label: 'Grid' },
  { key: 'axes', label: 'Coordinate Axes' },
  { key: 'overheadLabels', label: 'Overhead Labels' },
];

// ── Styles (injected once) ──────────────────────────────────────────────────

const STYLE_ID = 'layer-panel-style';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    #layer-panel {
      position: absolute;
      top: 50px;
      left: 8px;
      z-index: 30;
      min-width: 150px;
      background: rgba(13, 17, 23, 0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-family: var(--mono);
      user-select: none;
      overflow: hidden;
    }
    #layer-panel .lp-header {
      padding: 6px 10px;
      font-size: 9px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border-bottom: 1px solid var(--border);
      background: rgba(13, 17, 23, 0.5);
    }
    #layer-panel .lp-body {
      padding: 4px 0;
    }
    #layer-panel .lp-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px;
      cursor: pointer;
      transition: background 0.12s;
      font-size: 10px;
      color: var(--text);
    }
    #layer-panel .lp-row:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    #layer-panel .lp-row input[type="checkbox"] {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border: 1px solid var(--border);
      border-radius: 3px;
      background: var(--surface2);
      cursor: pointer;
      flex-shrink: 0;
      position: relative;
      transition: background 0.15s, border-color 0.15s;
    }
    #layer-panel .lp-row input[type="checkbox"]:checked {
      background: var(--accent);
      border-color: var(--accent);
    }
    #layer-panel .lp-row input[type="checkbox"]:checked::after {
      content: '';
      position: absolute;
      left: 3px;
      top: 1px;
      width: 5px;
      height: 8px;
      border: solid #000;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
    #layer-panel .lp-label {
      flex: 1;
      pointer-events: none;
    }
    #layer-panel .lp-separator {
      height: 1px;
      background: var(--border);
      margin: 4px 10px;
    }
    #layer-panel .lp-clear-btn {
      display: block;
      width: calc(100% - 20px);
      margin: 6px 10px;
      padding: 5px 8px;
      background: var(--surface3);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--muted);
      font-family: var(--mono);
      font-size: 9px;
      cursor: pointer;
      text-align: center;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
    }
    #layer-panel .lp-clear-btn:hover {
      color: var(--danger);
      border-color: var(--danger);
      background: rgba(248, 81, 73, 0.08);
    }
  `;
  document.head.appendChild(s);
}

// ── DOM building ────────────────────────────────────────────────────────────

export function initLayerPanel(): void {
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap) return;
  if (document.getElementById('layer-panel')) return;

  injectStyles();

  panel = document.createElement('div');
  panel.id = 'layer-panel';

  // ── Header ──────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'lp-header';
  header.textContent = 'Layers';
  panel.appendChild(header);

  // ── Body ────────────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'lp-body';

  const editor = getEditor();

  LAYERS.forEach(({ key, label }) => {
    const row = document.createElement('label');
    row.className = 'lp-row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = editor.layerVisibility[key];

    const labelEl = document.createElement('span');
    labelEl.className = 'lp-label';
    labelEl.textContent = label;

    row.appendChild(cb);
    row.appendChild(labelEl);

    cb.addEventListener('change', () => {
      setLayerVisible(key, cb.checked);
      scheduleRebuild();
    });

    checkboxes.set(key, cb);
    body.appendChild(row);
  });

  // ── Separator ───────────────────────────────────────────────────────────
  const sep = document.createElement('div');
  sep.className = 'lp-separator';
  body.appendChild(sep);

  // ── Clear Measurements button ───────────────────────────────────────────
  const clearBtn = document.createElement('button');
  clearBtn.className = 'lp-clear-btn';
  clearBtn.textContent = 'Clear Measurements';
  clearBtn.addEventListener('click', () => {
    clearMeasurements();
    scheduleRebuild();
  });
  body.appendChild(clearBtn);

  panel.appendChild(body);
  wrap.appendChild(panel);

  syncLayerPanel();
}

// ── Sync checkbox states from editor ────────────────────────────────────────

export function syncLayerPanel(): void {
  if (!panel) return;
  const editor = getEditor();
  for (const [key, cb] of checkboxes) {
    cb.checked = editor.layerVisibility[key];
  }
  panel.style.display = editor.showLayerPanel ? 'block' : 'none';
}
