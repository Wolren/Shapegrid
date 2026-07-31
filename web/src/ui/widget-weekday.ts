// ══════════════════════════════════════════════════════════════════════════════
// Widget: Weekday — contribution distribution across days of the week
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, getWidgetSetting, widgetFontScale } from './dashboard';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function renderWeekday(container: HTMLElement, _id: string): void {
  const heightSetting = getWidgetSetting('weekday', 'height', 130) as number;
  const cellData = state.cellData;
  const f = widgetFontScale('weekday');

  container.style.fontSize = (10 * f) + 'px';
  container.style.padding = '6px 8px';
  container.style.overflow = 'hidden';

  if (!cellData || cellData.length === 0) {
    container.textContent = 'No contribution data';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
    return;
  }

  // Aggregate counts per weekday (Mon=0 ... Sun=6)
  const totals = new Array(7).fill(0);
  let parsed = 0;
  for (const d of cellData) {
    if (!d.date) continue;
    const date = new Date(d.date);
    if (isNaN(date.getTime())) continue;
    // getDay(): 0=Sun ... 6=Sat  →  Mon-first index
    const idx = (date.getDay() + 6) % 7;
    totals[idx] += d.count;
    parsed++;
  }

  const maxTotal = Math.max(...totals, 1);

  // ── Pixel dimensions ───────────────────────────────────────────────────
  const svgW = Math.max(container.clientWidth || 180, 120);
  const svgH = Math.max(heightSetting - 16, 80);
  const padT = 14;
  const padB = 14;
  const plotH = svgH - padT - padB;
  const baseline = padT + plotH;
  const slot = svgW / 7;
  const barW = Math.max(Math.min(slot * 0.55, 26), 4);

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

  for (let i = 0; i < 7; i++) {
    const cx = slot * i + slot / 2;
    const h = (totals[i] / maxTotal) * plotH;
    const y = baseline - h;

    // Bar
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', (cx - barW / 2).toFixed(1));
    rect.setAttribute('y', y.toFixed(1));
    rect.setAttribute('width', barW.toFixed(1));
    rect.setAttribute('height', Math.max(h, 0).toFixed(1));
    const opacity = totals[i] > 0 ? 0.4 + (totals[i] / maxTotal) * 0.6 : 0.18;
    rect.setAttribute('fill', '#39d353');
    rect.setAttribute('opacity', opacity.toFixed(2));
    rect.setAttribute('rx', '1');

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${DAY_LABELS[i]}: ${totals[i]} contributions`;
    rect.appendChild(title);

    svg.appendChild(rect);

    // Value above bar (only when it fits)
    if (totals[i] > 0 && h > 12) {
      const val = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      val.setAttribute('x', cx.toFixed(1));
      val.setAttribute('y', (y - 3).toFixed(1));
      val.setAttribute('text-anchor', 'middle');
      val.setAttribute('fill', 'rgba(255,255,255,0.6)');
      val.setAttribute('font-size', (7 * f).toFixed(1));
      val.textContent = String(totals[i]);
      svg.appendChild(val);
    }

    // Day label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', cx.toFixed(1));
    label.setAttribute('y', String(baseline + 10));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', 'rgba(255,255,255,0.45)');
    label.setAttribute('font-size', (7 * f).toFixed(1));
    label.textContent = DAY_LABELS[i];
    svg.appendChild(label);
  }

  container.appendChild(svg);

  if (parsed === 0) {
    container.textContent = 'No dated contributions';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
  }
}

registerWidget('weekday', renderWeekday);
