// ══════════════════════════════════════════════════════════════════════════════
// Dashboard widget manager — overlay panel for toggling / configuring widgets
// ══════════════════════════════════════════════════════════════════════════════

import type { WidgetId, WidgetConfig } from '../types';
import { WIDGET_META, POSITION_OPTIONS, type WidgetSettingDef, type WidgetMeta } from './widget-meta';
import { injectStyles } from './widget-styles';
import { state } from './state';
import { toggleWidget, setWidgetPosition, setWidgetSetting, toggleManager, resetDashboard } from './dashboard';
import { renderAllWidgets, saveCurrentLayoutAs, loadDashboardLayout, deleteDashboardLayout, listDashboardLayouts } from './dashboard';

// ── Widget metadata (title + settings UI) ────────────────────────────────────

// ── DOM cache ────────────────────────────────────────────────────────────────

let _toggleBtn: HTMLElement | null = null;

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

/** Widget id + display title list, used by the Theme tab's Widget Colors. */
export function listWidgetMeta(): { id: WidgetId; title: string }[] {
  return WIDGET_META.map(m => ({ id: m.id, title: m.title }));
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
  if (layouts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'dm-layout-empty';
    empty.textContent = 'No saved layouts yet. Save the current widget layout above, then load it from here.';
    listEl.appendChild(empty);
    return;
  }
  for (const layout of layouts) {
    const row = document.createElement('div');
    row.className = 'dm-layout-row';

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'dm-layout-name';
    name.textContent = layout.name;
    name.title = `Load layout: ${layout.name}`;
    name.addEventListener('click', () => {
      loadDashboardLayout(layout.name);
      buildPanel();
    });
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
