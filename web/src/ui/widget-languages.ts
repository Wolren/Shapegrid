// ══════════════════════════════════════════════════════════════════════════════
// Widget: language breakdown - colour chip, name, share bar, percentage.
// Mirrors packages/core/cli/src/svg-widgets.ts renderLanguages.
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, getWidgetSetting, renderAllWidgets, widgetAccent, widgetUnit } from './dashboard';
import type { WidgetId, GitHubLanguage } from '../types';

const PANEL_W = 260;
const PAD = 16;
const HEADER_H = 30;
const ROW_H = 46;
const CHIP = 13;
const NAME_PX = 26;
const PCT_PX = 20;
const BAR_H = 9;
const TITLE_PX = 15;

/** '#rrggbb' + alpha -> 'rgba(r, g, b, a)'. */
function rgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Style the widget frame (wrapper + header) for the canvas-relative layout. */
function styleFrame(container: HTMLElement, u: number, panelW: number, accent: string): void {
  const wrapper = container.closest('.dashboard-widget') as HTMLElement | null;
  if (!wrapper) return;
  wrapper.style.width = Math.round(panelW) + 'px';
  wrapper.style.maxWidth = 'none';
  wrapper.style.minWidth = '0';
  wrapper.style.background = 'rgba(13,17,23,0.94)';
  // The panel is near-opaque: the blurred backdrop only adds capture artefacts.
  wrapper.style.backdropFilter = 'none';
  // html2canvas paints box-shadow as a dark band inside the captured element.
  wrapper.style.boxShadow = 'none';

  const header = wrapper.querySelector('.dw-header') as HTMLElement | null;
  if (header) {
    header.style.height = Math.round(HEADER_H * u) + 'px';
    header.style.padding = `0 ${Math.round(PAD * u)}px`;
    header.style.background = rgba(accent, 0.12);
    header.style.borderBottom = `${Math.max(1, Math.round(u))}px solid ${rgba(accent, 0.32)}`;
  }
  const title = wrapper.querySelector('.dw-title') as HTMLElement | null;
  if (title) {
    title.style.fontSize = (TITLE_PX * u).toFixed(1) + 'px';
    title.style.letterSpacing = (1.4 * u).toFixed(1) + 'px';
  }
}

function renderLanguages(container: HTMLElement, id: string): void {
  const u = widgetUnit(id as WidgetId);
  const maxItems = getWidgetSetting(id as WidgetId, 'maxItems', 4) as number;
  const langs = (state.languages ?? []).slice(0, maxItems);

  container.style.padding = '0';
  container.style.fontFamily = 'system-ui, -apple-system, sans-serif';

  if (langs.length === 0) {
    styleFrame(container, u, PANEL_W * u, widgetAccent(id as WidgetId));
    container.style.padding = `${Math.round(PAD * u)}px`;
    container.textContent = 'No language data';
    container.style.color = 'rgba(255,255,255,0.45)';
    container.style.fontStyle = 'italic';
    container.style.fontSize = (PCT_PX * 0.6 * u).toFixed(1) + 'px';
    container.style.textAlign = 'center';
    return;
  }

  styleFrame(container, u, PANEL_W * u, widgetAccent(id as WidgetId));
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '0';
  container.style.padding = `${Math.round(PAD * u)}px 0`;

  for (const lang of langs) {
    const row = document.createElement('div');
    row.style.height = Math.round(ROW_H * u) + 'px';
    row.style.padding = `0 ${Math.round(PAD * u)}px`;
    row.style.boxSizing = 'border-box';
    row.style.position = 'relative';

    const chip = document.createElement('span');
    chip.style.position = 'absolute';
    chip.style.left = Math.round(PAD * u) + 'px';
    chip.style.top = Math.round(9 * u) + 'px';
    chip.style.width = Math.round(CHIP * u) + 'px';
    chip.style.height = Math.round(CHIP * u) + 'px';
    chip.style.borderRadius = Math.round(3 * u) + 'px';
    chip.style.background = lang.color || '#888';
    chip.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.18)';

    const name = document.createElement('span');
    name.textContent = lang.name;
    name.style.position = 'absolute';
    name.style.left = Math.round((PAD + CHIP + 10) * u) + 'px';
    name.style.top = Math.round(2 * u) + 'px';
    name.style.right = Math.round((PAD + 56) * u) + 'px';
    name.style.color = '#e6edf3';
    name.style.fontSize = (NAME_PX * u).toFixed(1) + 'px';
    name.style.fontWeight = '600';
    name.style.lineHeight = Math.round(26 * u) + 'px';
    name.style.whiteSpace = 'nowrap';
    name.style.overflow = 'hidden';
    name.style.textOverflow = 'ellipsis';

    const barOuter = document.createElement('div');
    barOuter.style.position = 'absolute';
    barOuter.style.left = Math.round((PAD + CHIP + 10) * u) + 'px';
    barOuter.style.right = Math.round(PAD * u) + 'px';
    barOuter.style.top = Math.round(31 * u) + 'px';
    barOuter.style.height = Math.round(BAR_H * u) + 'px';
    barOuter.style.background = 'rgba(255,255,255,0.12)';
    barOuter.style.borderRadius = Math.round((BAR_H / 2) * u) + 'px';
    barOuter.style.overflow = 'hidden';

    const barInner = document.createElement('div');
    barInner.style.width = `${Math.max(4, lang.percentage)}%`;
    barInner.style.height = '100%';
    barInner.style.background = lang.color || '#888';
    barInner.style.borderRadius = Math.round((BAR_H / 2) * u) + 'px';
    barOuter.appendChild(barInner);

    const pct = document.createElement('span');
    pct.textContent = `${lang.percentage.toFixed(1)}%`;
    pct.style.position = 'absolute';
    pct.style.right = Math.round(PAD * u) + 'px';
    pct.style.top = Math.round(2 * u) + 'px';
    pct.style.color = '#c9d1d9';
    pct.style.fontFamily = "'IBM Plex Mono', monospace";
    pct.style.fontSize = (PCT_PX * u).toFixed(1) + 'px';
    pct.style.lineHeight = Math.round(26 * u) + 'px';
    pct.style.fontWeight = '500';
    pct.style.fontVariantNumeric = 'tabular-nums';

    row.appendChild(chip);
    row.appendChild(name);
    row.appendChild(barOuter);
    row.appendChild(pct);
    container.appendChild(row);
  }
}

registerWidget('languages', renderLanguages);

export function updateLanguagesWidget(data: GitHubLanguage[]): void {
  state.languages = data;
  renderAllWidgets();
}
