// ══════════════════════════════════════════════════════════════════════════════
// Widget: Contribution Distribution Histogram — GIS-style bin chart
// Bins cellData counts into N bins and renders vertical bars
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, getWidgetSetting } from './dashboard';

function renderDistribution(container: HTMLElement, _id: string): void {
  const bins = getWidgetSetting('distribution', 'bins', 8) as number;
  const cellData = state.cellData;

  container.style.fontSize = '10px';
  container.style.padding = '4px 8px';

  if (!cellData || cellData.length === 0) {
    container.textContent = 'No contribution data';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
    return;
  }

  // ── Compute distribution ──────────────────────────────────────────────
  const counts = cellData.map(d => d.count);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const range = maxCount - minCount;

  // Build linear bin boundaries
  const binWidth = range > 0 ? range / bins : 1;
  const boundaries: number[] = [];
  for (let i = 0; i <= bins; i++) {
    boundaries.push(minCount + i * binWidth);
  }

  // Bin the data
  const binned = new Array(bins).fill(0);
  for (const c of counts) {
    if (range > 0) {
      let idx = Math.min(Math.floor((c - minCount) / binWidth), bins - 1);
      if (c === maxCount) idx = bins - 1;
      binned[idx]++;
    } else {
      // All values identical — put everything in last bin
      binned[bins - 1]++;
    }
  }

  const maxBinCount = Math.max(...binned);

  // ── SVG histogram ─────────────────────────────────────────────────────
  const chartHeight = 65; // usable y range within viewBox
  const chartBottom = 73; // y-coordinate of baseline
  const viewBoxW = 100;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '80');
  svg.setAttribute('viewBox', `0 0 ${viewBoxW} 80`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.display = 'block';

  const barPadding = 1;
  const barStep = viewBoxW / bins;
  const barDrawWidth = Math.max(barStep - barPadding, 1);

  for (let i = 0; i < bins; i++) {
    const barHeight = maxBinCount > 0
      ? (binned[i] / maxBinCount) * chartHeight
      : 0;
    const x = i * barStep + barPadding / 2;
    const y = chartBottom - barHeight;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(barDrawWidth));
    rect.setAttribute('height', String(Math.max(barHeight, 0)));
    rect.setAttribute('fill', '#39d353');
    // Opacity gradient from dim (low) to bright (high)
    const opacity = 0.25 + (i / Math.max(bins - 1, 1)) * 0.75;
    rect.setAttribute('opacity', opacity.toFixed(2));

    // Native SVG tooltip
    const binStart = boundaries[i];
    const binEnd = boundaries[i + 1];
    const rangeLabel = formatRangeLabel(binStart, binEnd);
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${rangeLabel}: ${binned[i]} cell${binned[i] !== 1 ? 's' : ''}`;
    rect.appendChild(title);

    svg.appendChild(rect);
  }

  // Value label above tallest bar
  if (maxBinCount > 0) {
    const tallestIdx = binned.indexOf(maxBinCount);
    const tallestX = tallestIdx * barStep + barStep / 2;
    const tallestY = chartBottom - (binned[tallestIdx] / maxBinCount) * chartHeight;

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(tallestX));
    label.setAttribute('y', String(tallestY - 3));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#39d353');
    label.setAttribute('font-size', '8');
    label.setAttribute('font-weight', '600');
    label.textContent = String(maxBinCount);
    svg.appendChild(label);
  }

  container.appendChild(svg);
}

/** Format a numeric bin range for display. Rounds to human-friendly values. */
function formatRangeLabel(a: number, b: number): string {
  const fmt = (v: number): string => {
    if (v >= 1000) return v.toLocaleString();
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(1);
  };
  return `${fmt(a)}–${fmt(b)}`;
}

registerWidget('distribution', renderDistribution);
