// ══════════════════════════════════════════════════════════════════════════════
// Dashboard widget manager — overlay panel for toggling / configuring widgets
// ══════════════════════════════════════════════════════════════════════════════

import type { WidgetId, WidgetConfig } from '../types';
import { state } from './state';
import { toggleWidget, setWidgetPosition, setWidgetSetting, toggleManager, resetDashboard } from './dashboard';
import { renderAllWidgets, saveCurrentLayoutAs, loadDashboardLayout, deleteDashboardLayout, listDashboardLayouts } from './dashboard';

// ── Widget metadata (title + settings UI) ────────────────────────────────────

interface WidgetSettingDef {
  key: string;
  label: string;
  type: 'range' | 'checkbox' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

interface WidgetMeta {
  id: WidgetId;
  title: string;
  settings: WidgetSettingDef[];
}

const WIDGET_META: WidgetMeta[] = [
  {
    id: 'legend',
    title: 'Legend',
    settings: [
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'stats',
    title: 'Statistics',
    settings: [
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'distribution',
    title: 'Distribution',
    settings: [
      { key: 'bins', label: 'Number of bins', type: 'range', min: 3, max: 20, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'timeline',
    title: 'Timeline',
    settings: [
      { key: 'days', label: 'Days shown', type: 'range', min: 14, max: 365, step: 7 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'activity',
    title: 'Activity',
    settings: [
      { key: 'days', label: 'Days shown', type: 'range', min: 14, max: 182, step: 7 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'topCells',
    title: 'Top Cells',
    settings: [
      { key: 'maxItems', label: 'Max items', type: 'range', min: 3, max: 12, step: 1 },
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'languages',
    title: 'Languages',
    settings: [
      { key: 'maxItems', label: 'Max items', type: 'range', min: 1, max: 20, step: 1 },
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'cellInfo',
    title: 'Cell Info',
    settings: [
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'scaleBar',
    title: 'Scale',
    settings: [
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'coordinates',
    title: 'Coordinates',
    settings: [
      { key: 'decimals', label: 'Decimals', type: 'range', min: 0, max: 6, step: 1 },
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'weekday',
    title: 'Weekday',
    settings: [
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'streak',
    title: 'Streak',
    settings: [
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
    ],
  },
  {
    id: 'monthly',
    title: 'Monthly',
    settings: [
      { key: 'height', label: 'Height', type: 'range', min: 90, max: 420, step: 10 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
    ],
  },
  {
    id: 'geo',
    title: 'Geo Info',
    settings: [
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
    ],
  },
  {
    id: 'minimap',
    title: 'Mini Map',
    settings: [
      { key: 'height', label: 'Height', type: 'range', min: 90, max: 420, step: 10 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
    ],
  },
];

const POSITION_OPTIONS: { value: WidgetConfig['position']; label: string }[] = [
  { value: 'topLeft', label: 'Top Left' },
  { value: 'topRight', label: 'Top Right' },
  { value: 'bottomLeft', label: 'Bottom Left' },
  { value: 'bottomRight', label: 'Bottom Right' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

// ── DOM cache ────────────────────────────────────────────────────────────────

let _toggleBtn: HTMLElement | null = null;

// ── CSS injection ────────────────────────────────────────────────────────────

let _stylesInjected = false;

function injectStyles(): void {
  if (_stylesInjected) return;
  _stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
/* ── Dashboard Manager Panel ─────────────────────────────────────────────── */
#dashboard-manager {
  position: absolute;
  top: 0;
  right: 0;
  width: 220px;
  max-height: 80%;
  z-index: 25;
  background: rgba(13, 17, 23, 0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-radius: 0 0 0 var(--radius);
  font-family: var(--mono);
  color: var(--text);
  display: none;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
}

#dashboard-manager.visible {
  display: flex;
}

.dm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: rgba(13, 17, 23, 0.5);
}

.dm-header-title {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  font-weight: 500;
}

.dm-close-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
  font-family: var(--mono);
  transition: color 0.12s;
}

.dm-close-btn:hover {
  color: var(--danger);
}

.dm-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.dm-body::-webkit-scrollbar {
  width: 4px;
}
.dm-body::-webkit-scrollbar-track {
  background: transparent;
}
.dm-body::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 2px;
}

.dm-widget-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(48, 54, 61, 0.3);
  transition: background 0.12s;
}

.dm-widget-row:hover {
  background: rgba(22, 27, 34, 0.5);
}

.dm-widget-title {
  font-size: 10px;
  color: var(--text);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Toggle switch inside the manager (smaller) */
.dm-toggle {
  position: relative;
  width: 28px;
  height: 16px;
  flex-shrink: 0;
}

.dm-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.dm-toggle-slider {
  position: absolute;
  inset: 0;
  background: var(--surface3);
  border: 1px solid var(--border);
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.dm-toggle-slider::before {
  content: '';
  position: absolute;
  width: 10px;
  height: 10px;
  left: 2px;
  top: 2px;
  background: var(--muted);
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}

.dm-toggle input:checked + .dm-toggle-slider {
  background: #1a3a1a;
  border-color: var(--accent);
}

.dm-toggle input:checked + .dm-toggle-slider::before {
  transform: translateX(12px);
  background: var(--accent);
}

/* Position dropdown */
.dm-pos-select {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 8px;
  padding: 2px 4px;
  width: 70px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.12s;
}

.dm-pos-select:hover {
  border-color: var(--accent);
}

.dm-pos-select:focus {
  border-color: var(--accent2);
}

.dm-pos-select option {
  background: var(--surface2);
  color: var(--text);
}

/* Settings section */
.dm-settings {
  padding: 6px 10px 6px 30px;
  border-bottom: 1px solid rgba(48, 54, 61, 0.2);
}

.dm-settings-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.dm-settings-row:last-child {
  margin-bottom: 0;
}

.dm-settings-label {
  font-size: 8px;
  color: var(--muted);
  min-width: 50px;
  white-space: nowrap;
}

.dm-settings-row input[type="range"] {
  -webkit-appearance: none;
  flex: 1;
  height: 2px;
  background: var(--surface3);
  border-radius: 1px;
  outline: none;
  cursor: pointer;
}

.dm-settings-row input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  background: var(--accent);
  border-radius: 50%;
  cursor: pointer;
}

.dm-settings-value {
  font-size: 8px;
  color: var(--accent);
  min-width: 20px;
  text-align: right;
}

.dm-settings-row input[type="checkbox"] {
  width: 12px;
  height: 12px;
  accent-color: var(--accent);
  cursor: pointer;
}

.dm-settings-row select {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--text);
  font-family: var(--mono);
  font-size: 8px;
  padding: 2px 4px;
  flex: 1;
  cursor: pointer;
  outline: none;
}

/* Action buttons row */
.dm-actions {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.dm-btn {
  flex: 1;
  padding: 4px 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted);
  font-family: var(--mono);
  font-size: 8px;
  cursor: pointer;
  text-align: center;
  transition: all 0.12s;
}

.dm-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: #0e2a0e;
}

.dm-btn.danger:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: #2a0e0e;
}

/* ── Dashboard Manager Toggle Button ─────────────────────────────────────── */
#btn-dashboard-manager {
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
  font-size: 13px;
  transition: all 0.12s;
  position: relative;
}

#btn-dashboard-manager:hover {
  color: var(--text);
  background: var(--surface2);
  border-color: var(--border);
}

#btn-dashboard-manager.active {
  color: var(--accent);
  background: #0e2a0e;
  border-color: var(--accent);
}

#btn-dashboard-manager[data-tip]:hover::after {
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
  z-index: 35;
}
`;
  document.head.appendChild(style);
}

// ── Build a settings control ────────────────────────────────────────────────

function buildSettingsRow(def: WidgetSettingDef, widgetId: WidgetId): HTMLElement {
  const row = document.createElement('div');
  row.className = 'dm-settings-row';

  const label = document.createElement('span');
  label.className = 'dm-settings-label';
  label.textContent = def.label;
  row.appendChild(label);

  if (def.type === 'range') {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(def.min ?? 0);
    input.max = String(def.max ?? 100);
    input.step = String(def.step ?? 1);

    const cfg = state.dashboard.widgets.find(w => w.id === widgetId);
    input.value = String(cfg?.settings?.[def.key] ?? def.min ?? 0);

    input.addEventListener('input', () => {
      setWidgetSetting(widgetId, def.key, parseFloat(input.value));
      renderAllWidgets();
      updateSettingsValue(widgetId);
    });

    row.appendChild(input);

    const valSpan = document.createElement('span');
    valSpan.className = 'dm-settings-value';
    valSpan.dataset.settingKey = def.key;
    valSpan.dataset.widgetId = widgetId;
    const initVal = cfg?.settings?.[def.key] ?? def.min ?? 0;
    valSpan.textContent = def.key === 'scale' ? `${Math.round(initVal * 100)}%` : String(initVal);
    row.appendChild(valSpan);
  } else if (def.type === 'checkbox') {
    const input = document.createElement('input');
    input.type = 'checkbox';

    const cfg = state.dashboard.widgets.find(w => w.id === widgetId);
    input.checked = !!cfg?.settings?.[def.key];

    input.addEventListener('change', () => {
      setWidgetSetting(widgetId, def.key, input.checked);
      renderAllWidgets();
    });

    row.appendChild(input);
  } else if (def.type === 'select' && def.options) {
    const select = document.createElement('select');

    for (const opt of def.options) {
      const optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      select.appendChild(optionEl);
    }

    const cfg = state.dashboard.widgets.find(w => w.id === widgetId);
    select.value = String(cfg?.settings?.[def.key] ?? def.options[0]?.value ?? '');

    select.addEventListener('change', () => {
      setWidgetSetting(widgetId, def.key, select.value);
      renderAllWidgets();
    });

    row.appendChild(select);
  }

  return row;
}

// ── Build the settings section for one widget ────────────────────────────────

function buildSettingsSection(meta: WidgetMeta): HTMLElement | null {
  if (meta.settings.length === 0) return null;

  const section = document.createElement('div');
  section.className = 'dm-settings';
  section.id = `dm-settings-${meta.id}`;

  for (const sDef of meta.settings) {
    section.appendChild(buildSettingsRow(sDef, meta.id));
  }

  return section;
}

// ── Update the displayed value for a widget's settings ───────────────────────

function updateSettingsValue(widgetId: WidgetId): void {
  const cfg = state.dashboard.widgets.find(w => w.id === widgetId);
  if (!cfg) return;

  const section = document.getElementById(`dm-settings-${widgetId}`);
  if (!section) return;

  const valueSpans = section.querySelectorAll<HTMLSpanElement>('.dm-settings-value');
  for (const span of valueSpans) {
    const key = span.dataset.settingKey;
    if (key && cfg.settings[key] !== undefined) {
      const v = cfg.settings[key];
      span.textContent = key === 'scale' ? `${Math.round(v * 100)}%` : String(v);
    }
  }
}

// ── Build widget row ─────────────────────────────────────────────────────────

function buildWidgetRow(meta: WidgetMeta): HTMLElement {
  const row = document.createElement('div');
  row.className = 'dm-widget-row';

  const cfg = state.dashboard.widgets.find(w => w.id === meta.id);
  if (!cfg) return row;

  // Toggle switch
  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'dm-toggle';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = cfg.visible;
  checkbox.addEventListener('change', () => {
    toggleWidget(meta.id);
    renderAllWidgets();
  });

  const slider = document.createElement('span');
  slider.className = 'dm-toggle-slider';

  toggleLabel.appendChild(checkbox);
  toggleLabel.appendChild(slider);
  row.appendChild(toggleLabel);

  // Title
  const title = document.createElement('span');
  title.className = 'dm-widget-title';
  title.textContent = meta.title;
  row.appendChild(title);

  // Position select
  const posSelect = document.createElement('select');
  posSelect.className = 'dm-pos-select';

  for (const posOpt of POSITION_OPTIONS) {
    const optEl = document.createElement('option');
    optEl.value = posOpt.value;
    optEl.textContent = posOpt.label;
    if (cfg.position === posOpt.value) optEl.selected = true;
    posSelect.appendChild(optEl);
  }

  posSelect.addEventListener('change', () => {
    setWidgetPosition(meta.id, posSelect.value as WidgetConfig['position']);
    renderAllWidgets();
  });

  row.appendChild(posSelect);

  return row;
}

// ── Layout presets section ──────────────────────────────────────────────────

function renderLayoutsList(listEl: HTMLElement): void {
  listEl.innerHTML = '';
  const layouts = listDashboardLayouts();
  for (const layout of layouts) {
    const row = document.createElement('div');
    row.className = 'dm-layout-row';

    const name = document.createElement('span');
    name.className = 'dm-layout-name';
    name.textContent = layout.name;
    name.title = layout.name;
    row.appendChild(name);

    const loadBtn = document.createElement('button');
    loadBtn.className = 'dm-layout-load';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => {
      loadDashboardLayout(layout.name);
      buildPanel();
    });
    row.appendChild(loadBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'dm-layout-del';
    delBtn.textContent = '\u2715';
    delBtn.title = 'Delete layout';
    delBtn.addEventListener('click', () => {
      deleteDashboardLayout(layout.name);
      renderLayoutsList(listEl);
    });
    row.appendChild(delBtn);

    listEl.appendChild(row);
  }
}

function buildLayoutsSection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'dm-layouts';

  const header = document.createElement('div');
  header.className = 'dm-layouts-header';
  header.textContent = 'Layouts';
  section.appendChild(header);

  const listEl = document.createElement('div');
  listEl.id = 'dm-layouts-list';
  listEl.className = 'dm-layouts-list';

  const saveRow = document.createElement('div');
  saveRow.className = 'dm-layouts-save';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'dm-btn';
  saveBtn.textContent = 'Save';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'dm-layout-input';
  input.placeholder = 'Layout name';
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveBtn.click();
  });
  saveBtn.addEventListener('click', () => {
    saveCurrentLayoutAs(input.value);
    input.value = '';
    renderLayoutsList(listEl);
  });

  saveRow.appendChild(input);
  saveRow.appendChild(saveBtn);
  section.appendChild(saveRow);

  section.appendChild(listEl);

  renderLayoutsList(listEl);

  return section;
}

// ── Build the manager panel ─────────────────────────────────────────────────

function buildPanel(): HTMLElement {
  const panel = document.getElementById('dashboard-manager');
  if (!panel) {
    const wrap = document.getElementById('canvas-wrap');
    if (!wrap) throw new Error('#canvas-wrap not found');
  }
  const container = document.getElementById('dashboard-manager')!;
  container.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'dm-header';

  const title = document.createElement('span');
  title.className = 'dm-header-title';
  title.textContent = 'Widget Manager';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'dm-close-btn';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close widget manager');
  closeBtn.addEventListener('click', () => {
    toggleManager();
    syncManagerState();
  });

  header.appendChild(title);
  header.appendChild(closeBtn);
  container.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'dm-body';

  // Layout presets section (top of panel)
  body.appendChild(buildLayoutsSection());

  for (const meta of WIDGET_META) {
    // Widget row
    body.appendChild(buildWidgetRow(meta));

    // Settings section
    const settingsSection = buildSettingsSection(meta);
    if (settingsSection) {
      body.appendChild(settingsSection);
    }
  }

  container.appendChild(body);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'dm-actions';

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'dm-btn';
  collapseBtn.textContent = state.dashboard.collapsed ? 'Expand All' : 'Collapse All';
  collapseBtn.addEventListener('click', () => {
    state.dashboard.collapsed = !state.dashboard.collapsed;
    collapseBtn.textContent = state.dashboard.collapsed ? 'Expand All' : 'Collapse All';
    renderAllWidgets();
  });
  actions.appendChild(collapseBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'dm-btn danger';
  resetBtn.textContent = 'Reset Layout';
  resetBtn.addEventListener('click', () => {
    resetDashboard();
    // Rebuild the panel to reflect reset state
    syncManagerState();
    renderAllWidgets();
  });
  actions.appendChild(resetBtn);

  container.appendChild(actions);

  return container;
}

// ── Add the dashboard manager toggle button to the editor toolbar ────────────

function addToggleButton(): void {
  if (document.getElementById('btn-dashboard-manager')) return;

  const toolbar = document.getElementById('editor-toolbar');
  if (!toolbar) return;

  // Find the screenshot group to insert before
  const ssBtn = toolbar.querySelector('[data-action="export-png"]');
  const ssGroup = ssBtn?.closest('.toolbar-group');

  // Create button
  const btn = document.createElement('button');
  btn.id = 'btn-dashboard-manager';
  btn.type = 'button';
  btn.dataset.tip = 'Widget Manager';
  btn.setAttribute('aria-label', 'Toggle widget manager');
  btn.textContent = '☰';
  btn.addEventListener('click', () => {
    toggleManager();
    syncManagerState();
  });

  // Insert into toolbar — place after the last group (before spacer or after)
  // Actually, let's put it in the screenshot group with a separator
  if (ssGroup) {
    // Add separator then button
    const sep = document.createElement('div');
    sep.className = 'toolbar-sep';
    ssGroup.parentNode?.insertBefore(sep, ssGroup.nextSibling);

    const btnGroup = document.createElement('div');
    btnGroup.className = 'toolbar-group';
    btnGroup.appendChild(btn);
    ssGroup.parentNode?.insertBefore(btnGroup, sep.nextSibling);
  } else {
    // Fallback: add at the end of toolbar
    const spacer = toolbar.querySelector('.toolbar-spacer');
    if (spacer) {
      spacer.parentNode?.insertBefore(btn, spacer.nextSibling);
    } else {
      toolbar.appendChild(btn);
    }
  }

  _toggleBtn = btn;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise the dashboard manager panel and toggle button.
 * Call once during app bootstrap.
 */
export function initWidgetManager(): void {
  injectStyles();

  // Build / populate the manager panel
  buildPanel();

  // Add toggle button to toolbar
  addToggleButton();

  // Sync initial visibility
  syncManagerState();
}

/**
 * Refresh the manager panel state to match current state.dashboard.
 * Call after any external state change that affects widget visibility/position.
 */
export function syncManagerState(): void {
  const panel = document.getElementById('dashboard-manager');
  if (panel) {
    panel.classList.toggle('visible', state.dashboard.managerOpen);
  }

  if (_toggleBtn) {
    _toggleBtn.classList.toggle('active', state.dashboard.managerOpen);
  }
}
