// ══════════════════════════════════════════════════════════════════════════════
// Dashboard — GIS display widget container and state
// ══════════════════════════════════════════════════════════════════════════════

import type { WidgetId, WidgetConfig, DashboardState } from '../types';
import { state } from './state';

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'legend',      title: 'Legend',      visible: true,  position: 'bottomLeft',  order: 0, settings: { width: 180, scale: 1 }, customPos: null },
  { id: 'stats',       title: 'Statistics',  visible: true,  position: 'topRight',    order: 1, settings: { width: 220, scale: 1 }, customPos: null },
  { id: 'distribution',title: 'Distribution',visible: false, position: 'bottomLeft',  order: 2, settings: { bins: 8, width: 200, height: 130, scale: 1 }, customPos: null },
  { id: 'timeline',    title: 'Timeline',    visible: false, position: 'left',       order: 3, settings: { days: 90, width: 180, height: 110, scale: 1 }, customPos: null },
  { id: 'activity',    title: 'Activity',    visible: false, position: 'bottomRight', order: 4, settings: { days: 49, width: 180, height: 110, scale: 1 }, customPos: null },
  { id: 'topCells',    title: 'Top Cells',   visible: false, position: 'topLeft',     order: 5, settings: { maxItems: 5, width: 200, height: 150, scale: 1 }, customPos: null },
  { id: 'languages',   title: 'Languages',   visible: false, position: 'bottomRight', order: 6, settings: { maxItems: 5, width: 200, scale: 1 }, customPos: null },
  { id: 'cellInfo',    title: 'Cell Info',   visible: true,  position: 'bottomLeft',  order: 7, settings: { width: 200, scale: 1 }, customPos: null },
  { id: 'scaleBar',    title: 'Scale',       visible: false, position: 'bottomLeft',  order: 8, settings: { width: 180, scale: 1 }, customPos: null },
  { id: 'coordinates', title: 'Coordinates', visible: false, position: 'bottomRight', order: 9, settings: { decimals: 2, width: 160, scale: 1 }, customPos: null },
  { id: 'weekday',     title: 'Weekday',     visible: false, position: 'bottomRight', order: 10, settings: { width: 180, height: 130, scale: 1 }, customPos: null },
  { id: 'streak',      title: 'Streak',      visible: false, position: 'topRight',    order: 11, settings: { fontSize: 10, scale: 1 }, customPos: null },
  { id: 'monthly',     title: 'Monthly',     visible: false, position: 'bottomLeft',  order: 12, settings: { height: 130, scale: 1 }, customPos: null },
  { id: 'geo',         title: 'Geo Info',    visible: false, position: 'topLeft',     order: 13, settings: { fontSize: 10, scale: 1 }, customPos: null },
  { id: 'minimap',     title: 'Mini Map',    visible: false, position: 'topLeft',     order: 14, settings: { height: 160, scale: 1 }, customPos: null },
];

function cloneWidgets(): WidgetConfig[] {
  return DEFAULT_WIDGETS.map(w => ({
    ...w,
    settings: { locked: false, opacity: 1, ...w.settings },
    customPos: null,
  }));
}

export function getDefaultDashboard(): DashboardState {
  return { widgets: cloneWidgets(), collapsed: false, managerOpen: false, layout: 'floating' };
}

export function getWidgetConfig(id: WidgetId): WidgetConfig | undefined {
  return state.dashboard.widgets.find(w => w.id === id);
}

export function isWidgetVisible(id: WidgetId): boolean {
  const w = getWidgetConfig(id);
  return w ? w.visible : false;
}

export function toggleWidget(id: WidgetId): void {
  const w = getWidgetConfig(id);
  if (w) w.visible = !w.visible;
}

export function setWidgetVisible(id: WidgetId, visible: boolean): void {
  const w = getWidgetConfig(id);
  if (w) w.visible = visible;
}

export function setWidgetSetting(id: WidgetId, key: string, value: any): void {
  const w = getWidgetConfig(id);
  if (w) w.settings[key] = value;
}

export function getWidgetSetting(id: WidgetId, key: string, fallback?: any): any {
  const w = getWidgetConfig(id);
  if (!w) return fallback;
  return w.settings[key] !== undefined ? w.settings[key] : fallback;
}

// ── Widget scaling helpers ────────────────────────────────────────────────
// A single scale factor zooms the whole widget (layout + fonts). The font
// size setting scales the text within the widget independently.

export function widgetScaleOf(id: WidgetId): number {
  const s = getWidgetSetting(id, 'scale', 1) as number;
  return (typeof s === 'number' && s > 0) ? s : 1;
}

/** Effective base font size (px) for a widget: fontSize setting × scale. */
export function widgetFont(id: WidgetId, base = 10): number {
  const fs = getWidgetSetting(id, 'fontSize', base) as number;
  return ((typeof fs === 'number' && fs > 0) ? fs : base) * widgetScaleOf(id);
}

/** Multiplier to apply to every hardcoded px font size in a renderer. */
export function widgetFontScale(id: WidgetId): number {
  return widgetFont(id, 10) / 10;
}

const HEX_RE = /^#([0-9a-f]{6})$/i;

/**
 * Per-widget color palette. Widget colors are fully independent from the
 * editor theme: changing editor themes never touches widgets, and changing
 * widget colors never touches the editor. Each widget has an accent (its
 * primary color) and a secondary (labels, captions, sub-elements).
 */
export interface WidgetPalette {
  accent: string;
  secondary: string;
}

export const DEFAULT_WIDGET_PALETTES: Record<WidgetId, WidgetPalette> = {
  legend:       { accent: '#39d353', secondary: '#8b949e' },
  stats:        { accent: '#58a6ff', secondary: '#8b949e' },
  languages:    { accent: '#d29922', secondary: '#e6edf3' },
  cellInfo:     { accent: '#f778ba', secondary: '#8b949e' },
  scaleBar:     { accent: '#39d353', secondary: '#8b949e' },
  coordinates:  { accent: '#7d8590', secondary: '#8b949e' },
  distribution: { accent: '#f78166', secondary: '#8b949e' },
  timeline:     { accent: '#58a6ff', secondary: '#8b949e' },
  activity:     { accent: '#a371f7', secondary: '#8b949e' },
  topCells:     { accent: '#f778ba', secondary: '#8b949e' },
  weekday:      { accent: '#39d353', secondary: '#8b949e' },
  streak:       { accent: '#f78166', secondary: '#8b949e' },
  monthly:      { accent: '#58a6ff', secondary: '#8b949e' },
  geo:          { accent: '#a371f7', secondary: '#8b949e' },
  minimap:      { accent: '#39d353', secondary: '#8b949e' },
};

function widgetColor(id: WidgetId, key: keyof WidgetPalette): string {
  const custom = getWidgetSetting(id, key, '') as string;
  if (typeof custom === 'string' && HEX_RE.test(custom)) return custom.toLowerCase();
  return DEFAULT_WIDGET_PALETTES[id]?.[key] ?? (key === 'accent' ? '#39d353' : '#8b949e');
}

/**
 * A widget's primary color: its own 'accent' setting, or its fixed default.
 * NEVER falls back to the editor theme accent - widget colors are decoupled
 * from editor themes.
 */
export function widgetAccent(id: WidgetId): string {
  return widgetColor(id, 'accent');
}

/** A widget's secondary color (labels, captions, sub-elements). */
export function widgetSecondary(id: WidgetId): string {
  return widgetColor(id, 'secondary');
}

/** The site theme accent (used by non-widget UI like the measure overlay). */
export function siteAccent(): string {
  return state.theme.accent;
}

export function setWidgetPosition(id: WidgetId, pos: WidgetConfig['position']): void {
  const w = getWidgetConfig(id);
  if (w) {
    w.position = pos;
    w.customPos = null; // Reset drag when changing zone
  }
}

export function setWidgetCustomPos(id: WidgetId, x: number, y: number): void {
  const w = getWidgetConfig(id);
  if (w) w.customPos = { x, y };
}

export function toggleDashboardCollapsed(): void {
  state.dashboard.collapsed = !state.dashboard.collapsed;
}

export function toggleManager(): void {
  state.dashboard.managerOpen = !state.dashboard.managerOpen;
}

export function resetDashboard(): void {
  state.dashboard.widgets = cloneWidgets();
  state.dashboard.collapsed = false;
  state.dashboard.layout = 'floating';
}

// ── Layout presets (localStorage) ───────────────────────────────────────────

export interface DashboardLayout {
  name: string;
  savedAt: number;
  widgets: WidgetConfig[];
  collapsed: boolean;
  layout: 'floating' | 'grid';
}

const LAYOUTS_KEY = 'shapegrid.dashboard.layouts';

function deepCloneWidgets(widgets: WidgetConfig[]): WidgetConfig[] {
  return widgets.map(w => ({ ...w, settings: { ...w.settings }, customPos: w.customPos ? { ...w.customPos } : null }));
}

const VALID_POSITIONS: WidgetConfig['position'][] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'left', 'right'];

/** Coerce an untrusted entry from localStorage into a safe DashboardLayout (or drop it). */
function sanitizeLayout(raw: unknown): DashboardLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  if (typeof r.name !== 'string') return null;
  if (!Array.isArray(r.widgets)) return null;

  const widgets: WidgetConfig[] = [];
  for (const w of r.widgets) {
    if (!w || typeof w !== 'object') continue;
    const id = w.id;
    if (typeof id !== 'string') continue;
    const position = VALID_POSITIONS.includes(w.position) ? w.position : 'bottomLeft';
    widgets.push({
      id: id as WidgetId,
      title: typeof w.title === 'string' ? w.title : id,
      visible: w.visible !== false,
      position,
      order: typeof w.order === 'number' ? w.order : 0,
      settings: (w.settings && typeof w.settings === 'object') ? { ...w.settings } : {},
      customPos: (w.customPos && typeof w.customPos.x === 'number' && typeof w.customPos.y === 'number')
        ? { x: w.customPos.x, y: w.customPos.y }
        : null,
    });
  }
  if (widgets.length === 0) return null;

  return {
    name: r.name,
    savedAt: typeof r.savedAt === 'number' ? r.savedAt : Date.now(),
    widgets,
    collapsed: r.collapsed === true,
    layout: r.layout === 'grid' ? 'grid' : 'floating',
  };
}

export function listDashboardLayouts(): DashboardLayout[] {
  try {
    const raw = localStorage.getItem(LAYOUTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeLayout).filter((l): l is DashboardLayout => l !== null);
  } catch {
    return [];
  }
}

export function saveDashboardLayout(name: string): void {
  const layouts = listDashboardLayouts();
  const saved: DashboardLayout = {
    name,
    savedAt: Date.now(),
    widgets: deepCloneWidgets(state.dashboard.widgets),
    collapsed: state.dashboard.collapsed,
    layout: state.dashboard.layout,
  };
  const existing = layouts.findIndex(l => l.name === name);
  if (existing >= 0) layouts[existing] = saved;
  else layouts.push(saved);
  localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts));
}

export function loadDashboardLayout(name: string): void {
  const layout = listDashboardLayouts().find(l => l.name === name);
  if (!layout) return;
  state.dashboard.widgets = deepCloneWidgets(layout.widgets);
  state.dashboard.collapsed = layout.collapsed;
  state.dashboard.layout = layout.layout;
  renderAllWidgets();
}

export function deleteDashboardLayout(name: string): void {
  const layouts = listDashboardLayouts().filter(l => l.name !== name);
  localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts));
}

export function saveCurrentLayoutAs(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  saveDashboardLayout(trimmed);
}

// ── Widget renderer registry ────────────────────────────────────────────────

type WidgetRenderer = (container: HTMLElement, id: WidgetId) => void;
const renderers = new Map<WidgetId, WidgetRenderer>();

export function registerWidget(id: WidgetId, render: WidgetRenderer): void {
  renderers.set(id, render);
}

// ── Layout constants ────────────────────────────────────────────────────────

const ZONE_GAP = 4; // px gap between stacked widgets
const WIDGET_MARGIN = 4; // px from canvas edge

// Position anchors relative to the canvas-wrap
const ZONE_ANCHORS: Record<string, { top?: string; bottom?: string; left?: string; right?: string; translateY?: string }> = {
  topLeft:     { top: '36px', left: `${WIDGET_MARGIN}px` },
  topRight:    { top: '36px', right: `${WIDGET_MARGIN}px` },
  bottomLeft:  { bottom: `${WIDGET_MARGIN}px`, left: `${WIDGET_MARGIN}px` },
  bottomRight: { bottom: `${WIDGET_MARGIN}px`, right: `${WIDGET_MARGIN}px` },
  left:        { top: '50%', left: `${WIDGET_MARGIN}px`, translateY: '-50%' },
  right:       { top: '50%', right: `${WIDGET_MARGIN}px`, translateY: '-50%' },
};

// ── Drag handling ───────────────────────────────────────────────────────────

let dragState: { el: HTMLElement; id: WidgetId; lx: number; ly: number; startX: number; startY: number } | null = null;

function initWidgetDrag(header: HTMLElement, el: HTMLElement, id: WidgetId): void {
  header.addEventListener('mousedown', e => {
    if ((e.target as HTMLElement).closest('.dw-close')) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    dragState = {
      el, id,
      lx: e.clientX, ly: e.clientY,
      startX: rect.left, startY: rect.top,
    };
    el.classList.add('dragging');
  });
}

document.addEventListener('mousemove', e => {
  if (!dragState) return;
  const wrap = document.getElementById('canvas-wrap')!;
  const wrapRect = wrap.getBoundingClientRect();
  const dx = e.clientX - dragState.lx;
  const dy = e.clientY - dragState.ly;
  let newX = ((dragState.startX - wrapRect.left + dx) / wrapRect.width) * 100;
  let newY = ((dragState.startY - wrapRect.top + dy) / wrapRect.height) * 100;
  newX = Math.max(0, Math.min(85, newX));
  newY = Math.max(0, Math.min(85, newY));
  dragState.el.style.left = newX + '%';
  dragState.el.style.top = newY + '%';
  dragState.el.style.right = 'auto';
  dragState.el.style.bottom = 'auto';
  dragState.el.style.transform = 'none';
});

document.addEventListener('mouseup', () => {
  if (!dragState) return;
  const wrap = document.getElementById('canvas-wrap')!;
  const wrapRect = wrap.getBoundingClientRect();
  const elRect = dragState.el.getBoundingClientRect();
  const pctX = ((elRect.left - wrapRect.left) / wrapRect.width) * 100;
  const pctY = ((elRect.top - wrapRect.top) / wrapRect.height) * 100;
  setWidgetCustomPos(dragState.id, pctX, pctY);
  dragState.el.classList.remove('dragging');
  dragState = null;
});

// ── Main render ─────────────────────────────────────────────────────────────

export function renderAllWidgets(): void {
  const container = document.getElementById('dashboard-widgets');
  if (!container) return;
  container.innerHTML = '';

  const visible = state.dashboard.widgets
    .filter(w => w.visible)
    .sort((a, b) => a.order - b.order);

  // First pass: render all widgets into container at their zone positions
  for (const w of visible) {
    const render = renderers.get(w.id);
    if (!render) continue;

    const wrapper = document.createElement('div');
    wrapper.className = 'dashboard-widget';
    wrapper.style.position = 'absolute';
    wrapper.dataset.widgetId = w.id;
    wrapper.dataset.zone = w.position;
    wrapper.dataset.order = String(w.order);

    // Per-widget lock: no drag, no close button, default cursor
    const locked = !!w.settings.locked;
    if (locked) {
      wrapper.classList.add('locked');
    }
    // Per-widget opacity
    if (typeof w.settings.opacity === 'number') {
      wrapper.style.opacity = String(w.settings.opacity);
    }

    if (w.customPos) {
      wrapper.dataset.custom = '1';
      wrapper.style.left = w.customPos.x + '%';
      wrapper.style.top = w.customPos.y + '%';
      wrapper.style.right = 'auto';
      wrapper.style.bottom = 'auto';
      wrapper.style.transform = 'none';
    } else {
      // Zone-based anchor (exact anchor; pass 2 handles vertical stacking)
      const anchor = ZONE_ANCHORS[w.position];
      if (!anchor) continue;
      if (anchor.top) wrapper.style.top = anchor.top;
      if (anchor.bottom) wrapper.style.bottom = anchor.bottom;
      if (anchor.left) wrapper.style.left = anchor.left;
      if (anchor.right) wrapper.style.right = anchor.right;
      if (anchor.translateY) wrapper.style.transform = anchor.translateY;
    }

    // Header
    const header = document.createElement('div');
    header.className = 'dw-header';
    const title = document.createElement('span');
    title.className = 'dw-title';
    title.textContent = w.title;
    const close = document.createElement('span');
    close.className = 'dw-close';
    close.textContent = '\u2715';
    close.setAttribute('role', 'button');
    close.setAttribute('aria-label', `Close ${w.title} widget`);
    close.title = 'Close widget';
    close.addEventListener('click', () => {
      setWidgetVisible(w.id, false);
      renderAllWidgets();
    });
    if (locked) {
      close.style.display = 'none';
    }
    header.appendChild(title);
    header.appendChild(close);
    wrapper.appendChild(header);

    // Apply per-widget settings — base size × scale factor
    const wScale = widgetScaleOf(w.id);
    if (typeof w.settings.width === 'number') {
      wrapper.style.width = Math.round(w.settings.width * wScale) + 'px';
    }
    if (typeof w.settings.height === 'number') {
      wrapper.style.height = Math.round(w.settings.height * wScale) + 'px';
    }

    // Body
    const body = document.createElement('div');
    body.className = 'dw-body';
    body.style.fontSize = (10 * wScale) + 'px';
    wrapper.appendChild(body);
    container.appendChild(wrapper);

    // Let widget fill body
    render(body, w.id);

    // Init drag (skipped for locked widgets)
    if (!locked) {
      initWidgetDrag(header, wrapper, w.id);
    }
  }

  // Second pass: zone-based vertical stacking — ALWAYS reposition zone
  // widgets (including single-widget zones) so the first widget in a zone
  // sits exactly at its anchor, and shift entire stacks that would overflow
  // the wrap bounds so every widget stays visible.
  const zones = new Map<string, HTMLElement[]>();
  container.querySelectorAll('.dashboard-widget[data-zone]').forEach(el => {
    const zone = (el as HTMLElement).dataset.zone!;
    const list = zones.get(zone) || [];
    list.push(el as HTMLElement);
    zones.set(zone, list);
  });

  const wrapHeight = container.clientHeight || window.innerHeight;

  for (const [zone, els] of zones) {
    // Left/right zones are vertically centered anchors, not stacks — pass 1
    // already placed them exactly (no order offset).
    if (zone === 'left' || zone === 'right') continue;

    const isBottom = zone === 'bottomLeft' || zone === 'bottomRight';
    // Sort by order within zone
    els.sort((a, b) => parseInt(a.dataset.order || '0') - parseInt(b.dataset.order || '0'));

    // Widgets dragged to a custom position keep it — never re-stack them
    const stackEls = els.filter(el => el.dataset.custom !== '1');
    if (stackEls.length === 0) continue;

    // Measure heights first so positioning math is exact
    const heights = stackEls.map(el => el.offsetHeight || 40);
    const totalStack = heights.reduce((s, h) => s + h, 0) + ZONE_GAP * (stackEls.length - 1);

    const anchorTop = parseFloat(ZONE_ANCHORS[zone]?.top || '36');
    const anchorBottom = parseFloat(ZONE_ANCHORS[zone]?.bottom || '4');

    let accumulated = 0;
    if (isBottom) {
      // Stack upward from the bottom anchor
      if (anchorBottom + totalStack > wrapHeight) {
        // Overflow past the top: pin the stack top to the wrap top and
        // stack downward from there.
        for (let i = 0; i < stackEls.length; i++) {
          const el = stackEls[i];
          el.style.bottom = 'auto';
          el.style.top = accumulated + 'px';
          accumulated += heights[i] + ZONE_GAP;
        }
      } else {
        for (let i = 0; i < stackEls.length; i++) {
          const el = stackEls[i];
          el.style.top = 'auto';
          el.style.bottom = (anchorBottom + accumulated) + 'px';
          accumulated += heights[i] + ZONE_GAP;
        }
      }
    } else {
      // Stack downward from the top anchor
      if (anchorTop + totalStack > wrapHeight) {
        // Overflow past the bottom: shift the ENTIRE stack up so the
        // bottom of the last widget sits at the wrap bottom.
        const overflow = anchorTop + totalStack - wrapHeight;
        for (let i = 0; i < stackEls.length; i++) {
          const el = stackEls[i];
          el.style.bottom = 'auto';
          el.style.top = (anchorTop + accumulated - overflow) + 'px';
          accumulated += heights[i] + ZONE_GAP;
        }
      } else {
        for (let i = 0; i < stackEls.length; i++) {
          const el = stackEls[i];
          el.style.bottom = 'auto';
          el.style.top = (anchorTop + accumulated) + 'px';
          accumulated += heights[i] + ZONE_GAP;
        }
      }
    }
  }
}

// ── CSS injection ───────────────────────────────────────────────────────────

export function injectDashboardStyles(): void {
  if (document.getElementById('dash-style')) return;
  const style = document.createElement('style');
  style.id = 'dash-style';
  style.textContent = `
    .dashboard-widget.dragging { opacity: 0.85; z-index: 100; }
    .dashboard-widget { z-index: 15; }
  `;
  document.head.appendChild(style);
}
