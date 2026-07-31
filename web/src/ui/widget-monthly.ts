// ══════════════════════════════════════════════════════════════════════════════
// Widget: Monthly — contribution totals bar chart over the last 12 months
// Pixel-based SVG (no preserveAspectRatio stretching) like widget-weekday.ts.
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, getWidgetSetting, widgetFontScale } from './dashboard';
import type { WidgetId } from '../types';

// The widget id is asserted because the WidgetId union in types.ts is extended
// when this widget gets registered in the dashboard manager / app entry.
const WIDGET_ID = 'monthly' as unknown as WidgetId;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MonthTotal {
  key: string;
  year: number;
  month: number; // 0-based
  total: number;
}

function renderMonthly(container: HTMLElement, _id: string): void {
  const heightSetting = getWidgetSetting(WIDGET_ID, 'height', 130) as number;
  const days = state.contributions?.days ?? [];
  const f = widgetFontScale(WIDGET_ID);

  container.style.fontSize = (10 * f) + 'px';
  container.style.padding = '6px 8px';
  container.style.overflow = 'hidden';

  if (days.length === 0) {
    container.textContent = 'No contribution data';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
    return;
  }

  // Last 12 calendar months ending at the most recent day (chronological).
  // Months without data get total 0.
  const last = days[days.length - 1];
  let endYear = parseInt(last.date.slice(0, 4), 10);
  let endMonth = parseInt(last.date.slice(5, 7), 10) - 1; // 0-based
  if (Number.isNaN(endYear) || Number.isNaN(endMonth)) {
    const now = new Date();
    endYear = now.getFullYear();
    endMonth = now.getMonth();
  }

  const months: MonthTotal[] = [];
  for (let i = 0; i < 12; i++) {
    let y = endYear;
    let m = endMonth - i;
    while (m < 0) { m += 12; y--; }
    months.push({ key: `${y}-${String(m + 1).padStart(2, '0')}`, year: y, month: m, total: 0 });
  }
  months.reverse();

  const totals = new Map<string, number>();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    totals.set(key, (totals.get(key) ?? 0) + d.contributionCount);
  }
  for (const m of months) m.total = totals.get(m.key) ?? 0;

  const maxTotal = Math.max(...months.map(m => m.total), 1);

  // ── Pixel dimensions ───────────────────────────────────────────────────
  const svgW = Math.max(container.clientWidth || 180, 120);
  const svgH = Math.max(heightSetting - 16, 80);
  const padT = 16; // room for max label + value labels
  const padB = 14; // room for month labels
  const plotH = svgH - padT - padB;
  const baseline = padT + plotH;
  const slot = svgW / 12;
  const barW = Math.max(Math.min(slot * 0.6, 26), 2);
  const narrow = slot < 16; // first-letter month labels when tight

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(svgW));
  svg.setAttribute('height', String(svgH));
  svg.style.display = 'block';

  // Baseline
  const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  axis.setAttribute('x1', '0');
  axis.setAttribute('x2', String(svgW));
  axis.setAttribute('y1', baseline.toFixed(1));
  axis.setAttribute('y2', baseline.toFixed(1));
  axis.setAttribute('stroke', 'rgba(48,54,61,0.6)');
  axis.setAttribute('stroke-width', '0.5');
  svg.appendChild(axis);

  for (let i = 0; i < 12; i++) {
    const m = months[i];
    const cx = slot * i + slot / 2;
    const h = (m.total / maxTotal) * plotH;
    const y = baseline - h;

    // Bar
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', (cx - barW / 2).toFixed(1));
    rect.setAttribute('y', y.toFixed(1));
    rect.setAttribute('width', barW.toFixed(1));
    rect.setAttribute('height', Math.max(h, 0).toFixed(1));
    const opacity = m.total > 0 ? 0.4 + (m.total / maxTotal) * 0.6 : 0.18;
    rect.setAttribute('fill', '#39d353');
    rect.setAttribute('opacity', opacity.toFixed(2));
    rect.setAttribute('rx', '1');

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${MONTH_NAMES[m.month]} ${m.year}: ${m.total.toLocaleString()} contributions`;
    rect.appendChild(title);

    svg.appendChild(rect);

    // Value above bar (only when it fits)
    if (m.total > 0 && h > 12) {
      const val = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      val.setAttribute('x', cx.toFixed(1));
      val.setAttribute('y', (y - 3).toFixed(1));
      val.setAttribute('text-anchor', 'middle');
      val.setAttribute('fill', 'rgba(255,255,255,0.6)');
      val.setAttribute('font-size', (7 * f).toFixed(1));
      val.textContent = m.total.toLocaleString();
      svg.appendChild(val);
    }

    // Month label under the bar
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', cx.toFixed(1));
    label.setAttribute('y', String(baseline + 10));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', 'rgba(255,255,255,0.45)');
    label.setAttribute('font-size', (7 * f).toFixed(1));
    label.textContent = narrow ? MONTH_NAMES[m.month][0] : MONTH_NAMES[m.month];
    svg.appendChild(label);
  }

  // Max label at top-left
  const maxLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  maxLabel.setAttribute('x', '0');
  maxLabel.setAttribute('y', '10');
  maxLabel.setAttribute('fill', '#39d353');
  maxLabel.setAttribute('font-size', (7 * f).toFixed(1));
  maxLabel.setAttribute('font-weight', '600');
  maxLabel.textContent = `Max: ${maxTotal.toLocaleString()}`;
  svg.appendChild(maxLabel);

  container.appendChild(svg);
}

registerWidget(WIDGET_ID, renderMonthly);
