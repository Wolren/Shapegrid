// ══════════════════════════════════════════════════════════════════════════════
// Dashboard — GIS display widget container and state
// ══════════════════════════════════════════════════════════════════════════════

import type { WidgetId, WidgetConfig, DashboardState } from '../types';
import { state } from './state';

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'legend',      title: 'Legend',      visible: true,  position: 'bottomLeft',  order: 0, settings: { width: 180 }, customPos: null },
  { id: 'stats',       title: 'Statistics',  visible: true,  position: 'topRight',    order: 1, settings: { width: 220 }, customPos: null },
  { id: 'distribution',title: 'Distribution',visible: false, position: 'bottomLeft',  order: 2, settings: { bins: 8, width: 200 }, customPos: null },
  { id: 'timeline',    title: 'Timeline',    visible: false, position: 'left',       order: 3, settings: { days: 90, width: 180 }, customPos: null },
  { id: 'activity',    title: 'Activity',    visible: false, position: 'bottomRight', order: 4, settings: { days: 49, width: 180 }, customPos: null },
  { id: 'overview',    title: 'Overview',    visible: false, position: 'topLeft',     order: 5, settings: { size: 100, width: 160 }, customPos: null },
  { id: 'languages',   title: 'Languages',   visible: false, position: 'bottomRight', order: 6, settings: { maxItems: 5, width: 200 }, customPos: null },
  { id: 'cellInfo',    title: 'Cell Info',   visible: true,  position: 'bottomLeft',  order: 7, settings: { width: 200 }, customPos: null },
  { id: 'scaleBar',    title: 'Scale',       visible: false, position: 'bottomLeft',  order: 8, settings: { width: 160 }, customPos: null },
  { id: 'coordinates', title: 'Coordinates', visible: false, position: 'bottomRight', order: 9, settings: { decimals: 2, width: 160 }, customPos: null },
];

function cloneWidgets(): WidgetConfig[] {
  return DEFAULT_WIDGETS.map(w => ({ ...w, settings: { ...w.settings }, customPos: null }));
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

    if (w.customPos) {
      wrapper.style.left = w.customPos.x + '%';
      wrapper.style.top = w.customPos.y + '%';
      wrapper.style.right = 'auto';
      wrapper.style.bottom = 'auto';
      wrapper.style.transform = 'none';
    } else {
      // Zone-based anchor
      const anchor = ZONE_ANCHORS[w.position];
      if (!anchor) continue;
      if (anchor.top) wrapper.style.top = anchor.top;
      if (anchor.bottom) wrapper.style.bottom = anchor.bottom;
      if (anchor.left) wrapper.style.left = anchor.left;
      if (anchor.right) wrapper.style.right = anchor.right;
      if (anchor.translateY) wrapper.style.transform = anchor.translateY;

      // Initial offset by order within zone (will be corrected in pass 2)
      const orderOffset = w.order * 80; // 80px estimated height
      if (anchor.top) wrapper.style.top = (parseFloat(anchor.top) + orderOffset) + 'px';
      if (anchor.bottom) wrapper.style.bottom = (parseFloat(anchor.bottom) + orderOffset) + 'px';
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
    close.addEventListener('click', () => {
      setWidgetVisible(w.id, false);
      renderAllWidgets();
    });
    header.appendChild(title);
    header.appendChild(close);
    wrapper.appendChild(header);

    // Apply per-widget settings
    if (w.settings.width) {
      wrapper.style.width = w.settings.width + 'px';
    }

    // Body
    const body = document.createElement('div');
    body.className = 'dw-body';
    wrapper.appendChild(body);
    container.appendChild(wrapper);

    // Let widget fill body
    render(body, w.id);

    // Init drag
    initWidgetDrag(header, wrapper, w.id);
  }

  // Second pass: zone-based vertical stacking
  const zones = new Map<string, HTMLElement[]>();
  container.querySelectorAll('.dashboard-widget[data-zone]').forEach(el => {
    const zone = (el as HTMLElement).dataset.zone!;
    const list = zones.get(zone) || [];
    list.push(el as HTMLElement);
    zones.set(zone, list);
  });

  for (const [zone, els] of zones) {
    if (els.length < 2) continue; // No stacking needed
    const isBottom = zone === 'bottomLeft' || zone === 'bottomRight';
    // Sort by order within zone
    els.sort((a, b) => parseInt(a.dataset.order || '0') - parseInt(b.dataset.order || '0'));

    // Measure heights and stack
    let accumulated = 0;
    if (isBottom) {
      // Stack upward: first widget (lowest order) at bottom anchor, rest above
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (i > 0) {
          const prevEl = els[i - 1];
          accumulated += (prevEl.offsetHeight || 40) + ZONE_GAP;
          const currentBottom = parseFloat(ZONE_ANCHORS[zone]?.bottom || '4');
          el.style.bottom = (currentBottom + accumulated) + 'px';
        }
        void el.offsetHeight;
      }
    } else {
      // Stack downward from top
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        const h = el.offsetHeight || 40;
        if (i > 0) {
          accumulated += h + ZONE_GAP;
          const currentTop = parseFloat(ZONE_ANCHORS[zone]?.top || '36');
          el.style.top = (currentTop + accumulated) + 'px';
        }
        void el.offsetHeight;
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
