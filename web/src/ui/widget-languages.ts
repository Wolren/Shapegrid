// ══════════════════════════════════════════════════════════════════════════════
// Widget: GitHub Language Breakdown — Horizontal bars with colour circles
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, getWidgetSetting, renderAllWidgets, widgetFontScale } from './dashboard';
import type { GitHubLanguage } from '../types';

function renderLanguages(container: HTMLElement, _id: string): void {
  const maxItems = getWidgetSetting('languages', 'maxItems', 5) as number;
  const langs = (state.languages ?? []).slice(0, maxItems);
  const f = widgetFontScale('languages');

  container.style.fontSize = (10 * f) + 'px';
  container.style.padding = '6px 8px';

  if (langs.length === 0) {
    container.textContent = 'No language data';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
    return;
  }

  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '6px';

  for (const lang of langs) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';

    // Colour circle
    const dot = document.createElement('span');
    dot.style.width = '8px';
    dot.style.height = '8px';
    dot.style.borderRadius = '50%';
    dot.style.flexShrink = '0';
    dot.style.background = lang.color || '#888';
    dot.style.border = '1px solid rgba(255,255,255,0.1)';

    // Name
    const name = document.createElement('span');
    name.textContent = lang.name;
    name.style.color = '#e6edf3';
    name.style.minWidth = '60px';
    name.style.fontSize = (10 * f) + 'px';
    name.style.flexShrink = '0';

    // Percentage bar
    const barOuter = document.createElement('div');
    barOuter.style.flex = '1';
    barOuter.style.height = '8px';
    barOuter.style.background = 'rgba(255,255,255,0.08)';
    barOuter.style.borderRadius = '4px';
    barOuter.style.overflow = 'hidden';

    const barInner = document.createElement('div');
    barInner.style.width = `${lang.percentage}%`;
    barInner.style.height = '100%';
    barInner.style.background = lang.color || '#888';
    barInner.style.borderRadius = '4px';
    barInner.style.transition = 'width 0.3s ease';
    barOuter.appendChild(barInner);

    // Percentage label
    const pct = document.createElement('span');
    pct.textContent = `${lang.percentage.toFixed(1)}%`;
    pct.style.color = 'rgba(255,255,255,0.5)';
    pct.style.fontSize = (9 * f) + 'px';
    pct.style.minWidth = '38px';
    pct.style.textAlign = 'right';
    pct.style.fontVariantNumeric = 'tabular-nums';

    row.appendChild(dot);
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
