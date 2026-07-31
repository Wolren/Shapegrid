// ══════════════════════════════════════════════════════════════════════════════
// Widget: Streak — current and longest consecutive-day contribution streaks
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, widgetFontScale, widgetAccent } from './dashboard';
import type { WidgetId } from '../types';

const WIDGET_ID: WidgetId = 'streak';

function renderStreak(container: HTMLElement, _id: string): void {
  const accent = widgetAccent(WIDGET_ID);
  const f = widgetFontScale(WIDGET_ID);

  container.style.fontSize = (10 * f) + 'px';
  container.style.padding = '6px 8px';
  container.style.overflow = 'hidden';

  const days = state.contributions?.days ?? [];

  if (days.length === 0) {
    container.textContent = 'No streak data';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
    return;
  }

  // Current streak: consecutive active days ending at the most recent day.
  // If the most recent day has 0 contributions, the current streak is 0.
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) current++;
    else break;
  }

  // Longest streak: max run of active days anywhere in the data
  let longest = 0;
  let run = 0;
  for (const d of days) {
    if (d.contributionCount > 0) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }

  // Two-column layout mirroring widget-stats.ts
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:28px;align-items:flex-end';

  const makeCol = (val: string, label: string) => {
    const g = document.createElement('div');
    g.innerHTML =
      `<div style="font-size:${22 * f}px;font-weight:700;color:${accent};line-height:1.2;font-variant-numeric:tabular-nums">${val}</div>` +
      `<div style="font-size:${8 * f}px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-top:1px">${label}</div>`;
    return g;
  };

  row.appendChild(makeCol(String(current), 'Current'));
  row.appendChild(makeCol(String(longest), 'Longest'));

  container.appendChild(row);
}

registerWidget(WIDGET_ID, renderStreak);
