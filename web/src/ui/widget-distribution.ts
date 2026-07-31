// ══════════════════════════════════════════════════════════════════════════════
// Widget: Contribution Distribution Histogram — proper bin chart
// Pixel-based SVG (no preserveAspectRatio stretching) with baseline,
// count axis labels and value labels. Text is never distorted.
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, getWidgetSetting, widgetFontScale } from './dashboard';

function renderDistribution(container: HTMLElement, _id: string): void {
  const bins = getWidgetSetting('distribution', 'bins', 8) as number;
  const heightSetting = getWidgetSetting('distribution', 'height', 130) as number;
  const cellData = state.cellData;
  const f = widgetFontScale('distribution');

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

  const counts = cellData.map(d => d.count);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const range = maxCount - minCount;

  // Bin the data (identical values collapse into the last bin)
  const binned = new Array(bins).fill(0);
  if (range > 0) {
    const binWidth = range / bins;
    for (const c of counts) {
      let idx = Math.min(Math.floor((c - minCount) / binWidth), bins - 1);
      if (c === maxCount) idx = bins - 1;
      binned[idx]++;
    }
  } else {
    binned[bins - 1] = counts.length;
  }

  const maxBinCount = Math.max(...binned);
  const binWidth = range > 0 ? range / bins : 1;

  // ── Pixel dimensions from the widget body ──────────────────────────────
  const svgW = Math.max(container.clientWidth || 180, 120);
  const svgH = Math.max(heightSetting - 16, 80);
  const padL = 26;   // room for count axis labels
  const padR = 4;
  const padT = 16;   // room for the max label
  const padB = 16;   // room for range axis labels
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const baseline = padT + plotH;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(svgW));
  svg.setAttribute('height', String(svgH));
  svg.style.display = 'block';

  const barStep = plotW / bins;
  const barW = Math.max(barStep - 2, 1);

  // ── Grid lines + count axis ────────────────────────────────────────────
  for (let i = 0; i <= 2; i++) {
    const y = padT + plotH - (i / 2) * plotH;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(padL));
    line.setAttribute('x2', String(svgW - padR));
    line.setAttribute('y1', y.toFixed(1));
    line.setAttribute('y2', y.toFixed(1));
    line.setAttribute('stroke', 'rgba(48,54,61,0.6)');
    line.setAttribute('stroke-width', '0.5');
    svg.appendChild(line);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(padL - 4));
    label.setAttribute('y', (y + 2.5).toFixed(1));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('fill', 'rgba(255,255,255,0.45)');
    label.setAttribute('font-size', (7 * f).toFixed(1));
    label.textContent = i === 2 ? String(maxBinCount) : i === 1 ? String(Math.round(maxBinCount / 2)) : '0';
    svg.appendChild(label);
  }

  // ── Bars ───────────────────────────────────────────────────────────────
  for (let i = 0; i < bins; i++) {
    const barH = maxBinCount > 0 ? (binned[i] / maxBinCount) * plotH : 0;
    const x = padL + i * barStep + 1;
    const y = baseline - barH;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x.toFixed(1));
    rect.setAttribute('y', y.toFixed(1));
    rect.setAttribute('width', barW.toFixed(1));
    rect.setAttribute('height', Math.max(barH, 0).toFixed(1));
    // Data-driven opacity: dim for sparse bins, bright for dense ones
    const opacity = maxBinCount > 0 ? 0.3 + (binned[i] / maxBinCount) * 0.7 : 0.3;
    rect.setAttribute('fill', '#39d353');
    rect.setAttribute('opacity', opacity.toFixed(2));
    rect.setAttribute('rx', '0.5');

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${formatNum(minCount + i * binWidth)} – ${formatNum(minCount + (i + 1) * binWidth)}: ${binned[i]} cell${binned[i] !== 1 ? 's' : ''}`;
    rect.appendChild(title);

    svg.appendChild(rect);
  }

  // ── Value label above the tallest bar ──────────────────────────────────
  if (maxBinCount > 0) {
    const tallestIdx = binned.indexOf(maxBinCount);
    const tallestX = padL + tallestIdx * barStep + barStep / 2;
    const tallestY = baseline - (binned[tallestIdx] / maxBinCount) * plotH;

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', tallestX.toFixed(1));
    label.setAttribute('y', (tallestY - 4).toFixed(1));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#39d353');
    label.setAttribute('font-size', (8 * f).toFixed(1));
    label.setAttribute('font-weight', '600');
    label.textContent = String(maxBinCount);
    svg.appendChild(label);
  }

  // ── Range labels under the axis ────────────────────────────────────────
  const rangeLabel = (v: number): string => formatNum(Math.min(Math.max(v, minCount), maxCount));
  const leftRange = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  leftRange.setAttribute('x', String(padL));
  leftRange.setAttribute('y', String(baseline + 10));
  leftRange.setAttribute('text-anchor', 'start');
  leftRange.setAttribute('fill', 'rgba(255,255,255,0.45)');
  leftRange.setAttribute('font-size', (7 * f).toFixed(1));
  leftRange.textContent = rangeLabel(minCount);
  svg.appendChild(leftRange);

  const rightRange = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  rightRange.setAttribute('x', String(svgW - padR));
  rightRange.setAttribute('y', String(baseline + 10));
  rightRange.setAttribute('text-anchor', 'end');
  rightRange.setAttribute('fill', 'rgba(255,255,255,0.45)');
  rightRange.setAttribute('font-size', (7 * f).toFixed(1));
  rightRange.textContent = rangeLabel(maxCount);
  svg.appendChild(rightRange);

  container.appendChild(svg);
}

function formatNum(v: number): string {
  if (v >= 1000) return v.toLocaleString();
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

registerWidget('distribution', renderDistribution);
