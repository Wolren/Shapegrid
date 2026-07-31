// ══════════════════════════════════════════════════════════════════════════════
// Viewport toolbar — floats at the top of the 3D canvas
// ══════════════════════════════════════════════════════════════════════════════

import type { ToolType, LayerVisibility } from '../types';
import { setActiveTool, getEditor, setLayerVisible } from './editor-state';
import { scheduleRebuild } from './rebuild';

// ── Callbacks provided by the host (app.ts) ──────────────────────────────────

export interface ToolbarCallbacks {
  /** Recalculate zoom from grid bounds, call posCamera() */
  zoomToFit: () => void;
  /** Reset yaw=30, pitch=45, zoom=1.3, call posCamera() */
  resetCamera: () => void;
  /** Set yaw=0, pitch=89, call posCamera() */
  topDownView: () => void;
  /** Trigger the export-PNG pipeline */
  screenshot: () => void;
}

// ── Inline SVG icons (16×16 viewBox, simple paths) ─────────────────────────

const ICONS: Record<string, string> = {
  select:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M3 1v13l3.5-3.5L10 14l1-2.5L14 10z"/>'
    + '</svg>',

  pan:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M8 1v6M5 3l3-2 3 2M1 8h6M3 5l-2 3 2 3M15 8H9M13 5l2 3-2 3M8 15V9M5 13l3 2 3-2"/>'
    + '</svg>',

  measureDistance:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M1 4l3-3 3 3M1 12l3 3 3-3M1 4v8M1 14h14M14 4l-3-3-3 3M14 12l-3 3-3-3M14 4v8"/>'
    + '</svg>',

  measureArea:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M3 3h10v10H3z"/>'
    + '<path d="M3 3l2 2M13 3l-2 2M13 13l-2-2M3 13l2-2M6 3v2M10 3v2M3 6h2M3 10h2M13 6h-2M13 10h-2M6 13v-2M10 13v-2"/>'
    + '</svg>',

  zoomToFit:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M5 1H2v3M11 1h3v3M5 15H2v-3M11 15h3v-3M2 8h12M8 2v12"/>'
    + '</svg>',

  resetCamera:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<circle cx="8" cy="8" r="5"/>'
    + '<path d="M8 5v3l2 1.5"/>'
    + '</svg>',

  topDown:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<circle cx="8" cy="8" r="6"/>'
    + '<circle cx="8" cy="8" r="2"/>'
    + '</svg>',

  screenshot:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<rect x="2" y="4" width="12" height="10" rx="1.5"/>'
    + '<circle cx="8" cy="9" r="3"/>'
    + '<path d="M5 4l1-2h4l1 2"/>'
    + '</svg>',
};

// ── Tool definitions ────────────────────────────────────────────────────────

interface ToolDef {
  id: ToolType;
  label: string;
  iconKey: string;
}

const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select', iconKey: 'select' },
  { id: 'pan', label: 'Pan', iconKey: 'pan' },
  { id: 'measureDistance', label: 'Measure Distance', iconKey: 'measureDistance' },
  { id: 'measureArea', label: 'Measure Area', iconKey: 'measureArea' },
];

const CAMERA_ACTIONS = [
  { id: 'zoom-to-fit', label: 'Zoom to fit', iconKey: 'zoomToFit' },
  { id: 'reset-camera', label: 'Reset camera', iconKey: 'resetCamera' },
  { id: 'top-down', label: 'Top-down view', iconKey: 'topDown' },
] as const;

const EXPORT_ACTION = { id: 'export-png', label: 'Export PNG', iconKey: 'screenshot' } as const;

const LAYER_KEYS: Array<{ id: keyof LayerVisibility; label: string }> = [
  { id: 'boundary', label: 'Boundary' },
  { id: 'grid', label: 'Grid' },
  { id: 'axes', label: 'Axes' },
];

// ── CSS injection (self-contained) ──────────────────────────────────────────

let _stylesInjected = false;

function injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
#editor-toolbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 0;
  height: 32px;
  padding: 0 6px;
  background: rgba(13, 17, 23, 0.78);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
  pointer-events: auto;
  user-select: none;
  font-family: var(--mono);
  font-size: 10px;
}

#editor-toolbar .toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 2px;
}

#editor-toolbar .toolbar-sep {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 4px;
  flex-shrink: 0;
}

#editor-toolbar .toolbar-spacer {
  flex: 1;
}

/* ── Tool buttons ─────────────────────────────────────────────────────── */

#editor-toolbar .tool-btn,
#editor-toolbar .action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: color 0.12s, background 0.12s, border-color 0.12s;
  position: relative;
}

#editor-toolbar .tool-btn svg,
#editor-toolbar .action-btn svg {
  width: 14px;
  height: 14px;
  display: block;
}

#editor-toolbar .tool-btn:hover,
#editor-toolbar .action-btn:hover {
  color: var(--text);
  background: var(--surface3);
  border-color: var(--border);
}

#editor-toolbar .tool-btn:active,
#editor-toolbar .action-btn:active {
  transform: scale(0.94);
}

#editor-toolbar .tool-btn.active {
  color: var(--accent);
  background: rgba(57, 211, 83, 0.1);
  border-color: var(--accent);
}

#editor-toolbar .action-btn:active {
  transform: scale(0.94);
}

/* ── Button tooltips ──────────────────────────────────────────────────── */

#editor-toolbar .tool-btn::after,
#editor-toolbar .action-btn::after {
  content: attr(data-tip);
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  padding: 2px 6px;
  font-size: 9px;
  font-family: var(--mono);
  color: var(--text);
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s;
  z-index: 35;
}

#editor-toolbar .tool-btn:hover::after,
#editor-toolbar .action-btn:hover::after {
  opacity: 1;
}

/* ── Layer toggles ────────────────────────────────────────────────────── */

#editor-toolbar .layer-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 5px;
  height: 22px;
  cursor: pointer;
  color: var(--muted);
  font-size: 9px;
  transition: color 0.12s;
  border-radius: var(--radius);
}

#editor-toolbar .layer-toggle:hover {
  color: var(--text);
  background: var(--surface3);
}

#editor-toolbar .layer-toggle input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--surface2);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s, border-color 0.12s;
  margin: 0;
  position: relative;
}

#editor-toolbar .layer-toggle input[type="checkbox"]:checked {
  background: var(--accent);
  border-color: var(--accent);
}

#editor-toolbar .layer-toggle input[type="checkbox"]:checked::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 0;
  width: 4px;
  height: 6px;
  border: solid #000;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}

#editor-toolbar .layer-toggle input[type="checkbox"]:hover {
  border-color: var(--accent);
}
`;
  document.head.appendChild(style);
}

// ── DOM builder helpers ─────────────────────────────────────────────────────

function svgIcon(key: string): string {
  return ICONS[key] || '';
}

function createToolBtn(def: ToolDef): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tool-btn';
  btn.dataset.tool = def.id;
  btn.dataset.tip = def.label;
  btn.innerHTML = svgIcon(def.iconKey);
  return btn;
}

function createActionBtn(id: string, label: string, iconKey: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'action-btn';
  btn.dataset.action = id;
  btn.dataset.tip = label;
  btn.innerHTML = svgIcon(iconKey);
  return btn;
}

function createSep(): HTMLElement {
  const sep = document.createElement('div');
  sep.className = 'toolbar-sep';
  sep.ariaHidden = 'true';
  return sep;
}

function createLayerToggle(key: keyof LayerVisibility, label: string): HTMLLabelElement {
  const labelEl = document.createElement('label');
  labelEl.className = 'layer-toggle';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.layer = key;
  cb.addEventListener('change', () => {
    setLayerVisible(key, cb.checked);
    scheduleRebuild();
  });

  const span = document.createElement('span');
  span.textContent = label;

  labelEl.appendChild(cb);
  labelEl.appendChild(span);
  return labelEl;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialise the viewport toolbar and insert it into #canvas-wrap.
 * @param callbacks  Optional host callbacks for camera & screenshot actions
 * @returns The toolbar DOM element
 */
export function initToolbar(callbacks?: Partial<ToolbarCallbacks>): HTMLElement {
  injectStyles();

  // Remove any existing toolbar
  const existing = document.getElementById('editor-toolbar');
  if (existing) existing.remove();

  const toolbar = document.createElement('div');
  toolbar.id = 'editor-toolbar';

  // ── Group 1: Tool buttons ────────────────────────────────────────────
  const toolGroup = document.createElement('div');
  toolGroup.className = 'toolbar-group';

  for (const def of TOOLS) {
    const btn = createToolBtn(def);
    btn.addEventListener('click', () => {
      setActiveTool(def.id);
      syncToolbarState();
    });
    toolGroup.appendChild(btn);
  }

  toolbar.appendChild(toolGroup);
  toolbar.appendChild(createSep());

  // ── Group 2: Camera actions ──────────────────────────────────────────
  const camGroup = document.createElement('div');
  camGroup.className = 'toolbar-group';

  for (const act of CAMERA_ACTIONS) {
    const btn = createActionBtn(act.id, act.label, act.iconKey);

    switch (act.id) {
      case 'zoom-to-fit':
        btn.addEventListener('click', () => {
          callbacks?.zoomToFit?.();
        });
        break;
      case 'reset-camera':
        btn.addEventListener('click', () => {
          callbacks?.resetCamera?.();
        });
        break;
      case 'top-down':
        btn.addEventListener('click', () => {
          callbacks?.topDownView?.();
        });
        break;
    }

    camGroup.appendChild(btn);
  }

  toolbar.appendChild(camGroup);
  toolbar.appendChild(createSep());

  // ── Group 3: Layer toggles ───────────────────────────────────────────
  const layerGroup = document.createElement('div');
  layerGroup.className = 'toolbar-group';

  for (const l of LAYER_KEYS) {
    layerGroup.appendChild(createLayerToggle(l.id, l.label));
  }

  toolbar.appendChild(layerGroup);

  // ── Spacer ───────────────────────────────────────────────────────────
  const spacer = document.createElement('div');
  spacer.className = 'toolbar-spacer';
  toolbar.appendChild(spacer);

  // ── Group 4: Export PNG ────────────────────────────────────────────────
  const ssGroup = document.createElement('div');
  ssGroup.className = 'toolbar-group';

  const ssBtn = createActionBtn(EXPORT_ACTION.id, EXPORT_ACTION.label, EXPORT_ACTION.iconKey);
  ssBtn.addEventListener('click', () => {
    callbacks?.screenshot?.();
  });
  ssGroup.appendChild(ssBtn);

  toolbar.appendChild(ssGroup);

  // ── Insert into canvas-wrap ──────────────────────────────────────────
  const wrap = document.getElementById('canvas-wrap');
  if (wrap) {
    wrap.appendChild(toolbar);
  }

  // Sync initial state
  syncToolbarState();

  return toolbar;
}

/**
 * Update active states on all toolbar controls to match the current
 * editor state.  Call this after any external state change.
 */
export function syncToolbarState(): void {
  const editor = getEditor();

  // Tool buttons
  const toolBtns = document.querySelectorAll<HTMLButtonElement>('#editor-toolbar .tool-btn');
  for (const btn of toolBtns) {
    const tool = btn.dataset.tool as ToolType | undefined;
    if (tool) {
      btn.classList.toggle('active', tool === editor.activeTool);
    }
  }

  // Layer checkboxes
  const layerCbs = document.querySelectorAll<HTMLInputElement>('#editor-toolbar [data-layer]');
  for (const cb of layerCbs) {
    const key = cb.dataset.layer as keyof LayerVisibility | undefined;
    if (key) {
      cb.checked = editor.layerVisibility[key];
    }
  }
}
