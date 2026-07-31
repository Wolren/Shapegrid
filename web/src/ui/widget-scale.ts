// ══════════════════════════════════════════════════════════════════════════════
// Widget: Scale Bar — clean GIS scale with gradient bar and tick labels
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, widgetFontScale, widgetAccent, widgetSecondary } from './dashboard';
import type { WidgetId } from '../types';
import { geoKmPerUnit } from '../geometry/projection';

function renderScaleBar(container: HTMLElement, id: string): void {
  const accent = widgetAccent(id as WidgetId);
  const secondary = widgetSecondary(id as WidgetId);
  const cellSize = state.grid?.cellSize ?? 1;
  const f = widgetFontScale('scaleBar');

  // Geo mode: report real-world km. geoKmPerUnit returns null when no
  // geographic data is loaded (normalized 'cell units' fallback below).
  // Cells are square in normalized space, so one cell's typical ground size
  // is cellSize * average axis scale (exact for wgs84, where both axes share
  // one scale; for mercator the y-axis scale is 57.3x the x-axis scale).
  const geo = geoKmPerUnit(state.geoBounds, state.coordSystem);
  const kmPerCell = geo
    ? cellSize * ((geo.kmPerUnitX + geo.kmPerUnitY) / 2)
    : 0;

  container.style.fontSize = (10 * f) + 'px';
  container.style.padding = '8px 10px';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.gap = '4px';

  const bodyW = Math.max((container.clientWidth || 160) - 20, 100);

  // 2 segments — each segment = round number of cells (km in geo mode)
  const rawSegment = geo ? kmPerCell * 2 : cellSize * 2;
  const segmentValue = roundToNice(rawSegment);
  const segments = 2;
  const barW = Math.min(bodyW, 260);

  // ── The bar: gradient fill, thin, rounded ──────────────────────────────
  const barSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  barSvg.setAttribute('width', String(barW));
  barSvg.setAttribute('height', '14');
  barSvg.style.display = 'block';

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.setAttribute('id', 'sg-grad-' + Date.now());
  grad.setAttribute('x1', '0');
  grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '1');
  grad.setAttribute('y2', '0');
  const stopA = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stopA.setAttribute('offset', '0%');
  stopA.setAttribute('stop-color', accent);
  const stopB = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stopB.setAttribute('offset', '100%');
  stopB.setAttribute('stop-color', secondary);
  grad.appendChild(stopA);
  grad.appendChild(stopB);
  defs.appendChild(grad);
  barSvg.appendChild(defs);

  // Track (subtle)
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  track.setAttribute('x', '0');
  track.setAttribute('y', '4');
  track.setAttribute('width', String(barW));
  track.setAttribute('height', '6');
  track.setAttribute('rx', '3');
  track.setAttribute('fill', 'rgba(48,54,61,0.5)');
  barSvg.appendChild(track);

  // Segment fill with mid divider
  const segPx = barW / segments;
  for (let i = 0; i < segments; i++) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', (i * segPx).toFixed(1));
    rect.setAttribute('y', '4');
    rect.setAttribute('width', segPx.toFixed(1));
    rect.setAttribute('height', '6');
    rect.setAttribute('fill', `url(#${grad.getAttribute('id')})`);
    rect.setAttribute('opacity', (1 - i * 0.35).toFixed(2));
    barSvg.appendChild(rect);
  }

  // Tick marks at 0, mid, end
  for (let i = 0; i <= segments; i++) {
    const x = (i / segments) * barW;
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tick.setAttribute('x1', x.toFixed(1));
    tick.setAttribute('y1', '2');
    tick.setAttribute('x2', x.toFixed(1));
    tick.setAttribute('y2', '12');
    tick.setAttribute('stroke', 'rgba(255,255,255,0.55)');
    tick.setAttribute('stroke-width', '1');
    barSvg.appendChild(tick);
  }

  container.appendChild(barSvg);

  // ── Labels: 0 / value / total ──────────────────────────────────────────
  const labelRow = document.createElement('div');
  labelRow.style.display = 'flex';
  labelRow.style.justifyContent = 'space-between';
  labelRow.style.width = barW + 'px';
  labelRow.style.color = 'rgba(255,255,255,0.55)';
  labelRow.style.fontSize = (9 * f) + 'px';
  labelRow.style.fontFamily = 'var(--mono)';

  const leftLabel = document.createElement('span');
  leftLabel.textContent = '0';
  const midLabel = document.createElement('span');
  midLabel.textContent = geo
    ? `${unitLabel(segmentValue)} km`
    : unitLabel(segmentValue);
  const rightLabel = document.createElement('span');
  rightLabel.textContent = geo
    ? `${unitLabel(segmentValue * segments)} km`
    : unitLabel(segmentValue * segments);

  labelRow.appendChild(leftLabel);
  labelRow.appendChild(midLabel);
  labelRow.appendChild(rightLabel);
  container.appendChild(labelRow);

  // ── Units caption ──────────────────────────────────────────────────────
  const caption = document.createElement('div');
  caption.style.color = 'rgba(255,255,255,0.4)';
  caption.style.fontSize = (8 * f) + 'px';
  caption.style.fontStyle = 'italic';
  caption.textContent = geo
    ? `1 cell ≈ ${formatKm(kmPerCell)} km`
    : `${segments * segmentValue} cell units`;
  container.appendChild(caption);
}

/** Round to a nice human-readable number for scale markings */
function roundToNice(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

function unitLabel(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Format a km value with precision scaled to its magnitude (for captions). */
function formatKm(v: number): string {
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(3);
  return v.toFixed(4);
}

registerWidget('scaleBar', renderScaleBar);
