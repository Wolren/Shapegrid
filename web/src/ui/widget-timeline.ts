// ══════════════════════════════════════════════════════════════════════════════
// Widget: Contribution Trend Timeline — Compact SVG sparkline
// Renders a polyline of daily contribution counts with gradient fill and peaks
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, getWidgetSetting, widgetFontScale } from './dashboard';
import type { GitHubDay } from '../types';

function renderTimeline(container: HTMLElement, _id: string): void {
  const maxDays = getWidgetSetting('timeline', 'days', 90) as number;
  const days = state.contributions?.days ?? [];
  const f = widgetFontScale('timeline');

  container.style.fontSize = (10 * f) + 'px';
  container.style.padding = '4px 8px';

  if (days.length === 0) {
    container.textContent = 'No timeline data';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
    return;
  }

  // Take the most recent N days, keeping chronological order
  const recentDays: GitHubDay[] = days.slice(-maxDays);
  const count = recentDays.length;
  const maxContrib = Math.max(...recentDays.map(d => d.contributionCount), 1);

  // ── SVG dimensions ─────────────────────────────────────────────────────
  const svgW = 100;
  const svgH = 58;
  const padTop = 14;   // room for max label
  const padBottom = 4;
  const plotArea = svgH - padTop - padBottom;

  const gradId = 'tl-fill-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '60');
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH + 2}`); // +2 for small bottom margin
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.display = 'block';

  // ── Defs: gradient fill ────────────────────────────────────────────────
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.setAttribute('id', gradId);
  grad.setAttribute('x1', '0');
  grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0');
  grad.setAttribute('y2', '1');

  const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', '#39d353');
  stop1.setAttribute('stop-opacity', '0.35');

  const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', '#39d353');
  stop2.setAttribute('stop-opacity', '0');

  grad.appendChild(stop1);
  grad.appendChild(stop2);
  defs.appendChild(grad);
  svg.appendChild(defs);

  // ── Build data points (x, y in viewBox coords) ─────────────────────────
  const dataLen = count;
  const xScale = (i: number) => (dataLen > 1 ? (i / (dataLen - 1)) * (svgW - 2) + 1 : svgW / 2);
  const yScale = (v: number) => padTop + plotArea - (v / maxContrib) * plotArea;

  const pointStrings: string[] = [];
  for (let i = 0; i < dataLen; i++) {
    const x = xScale(i);
    const y = yScale(recentDays[i].contributionCount);
    pointStrings.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  // ── Fill polygon (below the line) ──────────────────────────────────────
  const fillPoints = [
    `${xScale(0).toFixed(1)},${padTop + plotArea}`,
    ...pointStrings,
    `${xScale(dataLen - 1).toFixed(1)},${padTop + plotArea}`,
  ];
  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', fillPoints.join(' '));
  polygon.setAttribute('fill', `url(#${gradId})`);
  svg.appendChild(polygon);

  // ── Polyline ───────────────────────────────────────────────────────────
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', pointStrings.join(' '));
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', '#39d353');
  polyline.setAttribute('stroke-width', '1.5');
  polyline.setAttribute('stroke-linejoin', 'round');
  polyline.setAttribute('stroke-linecap', 'round');
  svg.appendChild(polyline);

  // ── Top 3 peak dots ────────────────────────────────────────────────────
  const peakIndices = findTopPeaks(recentDays, 3);
  for (const idx of peakIndices) {
    const cx = xScale(idx);
    const cy = yScale(recentDays[idx].contributionCount);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', cx.toFixed(1));
    dot.setAttribute('cy', cy.toFixed(1));
    dot.setAttribute('r', '2');
    dot.setAttribute('fill', '#39d353');
    dot.setAttribute('stroke', '#0d1117');
    dot.setAttribute('stroke-width', '1');
    svg.appendChild(dot);
  }

  // ── Max label at highest peak ──────────────────────────────────────────
  const bestIdx = recentDays.reduce(
    (best, d, i, arr) => d.contributionCount > arr[best].contributionCount ? i : best,
    0
  );
  const bestCount = recentDays[bestIdx].contributionCount;
  if (bestCount > 0) {
    const maxX = xScale(bestIdx);
    const maxY = yScale(bestCount);

    const maxLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    maxLabel.setAttribute('x', maxX.toFixed(1));
    maxLabel.setAttribute('y', String(maxY - 5));
    maxLabel.setAttribute('text-anchor', 'middle');
    maxLabel.setAttribute('fill', '#39d353');
    maxLabel.setAttribute('font-size', (7 * f).toFixed(1));
    maxLabel.setAttribute('font-weight', '600');
    maxLabel.textContent = `Max: ${bestCount}`;
    svg.appendChild(maxLabel);
  }

  container.appendChild(svg);
}

/**
 * Find the indices of the top N peaks in a GitHubDay array.
 * A peak is a day with a contribution count that ranks in the top N.
 * Returns indices sorted in descending order of contribution count.
 */
function findTopPeaks(days: GitHubDay[], n: number): number[] {
  if (days.length === 0) return [];
  const withIdx = days.map((d, i) => ({ count: d.contributionCount, idx: i }));
  withIdx.sort((a, b) => b.count - a.count);
  return withIdx.slice(0, Math.min(n, withIdx.length)).map(x => x.idx);
}

registerWidget('timeline', renderTimeline);
