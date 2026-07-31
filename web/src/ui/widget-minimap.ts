// ══════════════════════════════════════════════════════════════════════════════
// Widget: Mini Map — 2D top-down intensity map of the grid
// Cells are colored by their actual intensity (palette-driven). The boundary
// outline keeps the shape readable; zero-intensity cells stay barely visible.
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, getWidgetSetting, widgetFontScale } from './dashboard';
import { activePaletteId, intensityToColor } from '../rendering/colors';
import type { WidgetId, Point2D } from '../types';

// The widget id is asserted because the WidgetId union in types.ts is extended
// when this widget gets registered in the dashboard manager / app entry.
const WIDGET_ID = 'minimap' as unknown as WidgetId;

function renderMinimap(container: HTMLElement, _id: string): void {
  const heightSetting = getWidgetSetting(WIDGET_ID, 'height', 160) as number;
  const f = widgetFontScale(WIDGET_ID);

  container.style.fontSize = (10 * f) + 'px';
  container.style.padding = '6px 8px';
  container.style.overflow = 'hidden';

  const poly = state.poly;
  const grid = state.grid;

  if (!poly || poly.length < 3) {
    container.textContent = 'No boundary data';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
    return;
  }

  if (!grid || !grid.cells || grid.cells.length === 0) {
    container.textContent = 'No grid data';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
    return;
  }

  // Intensity caption
  const cap = document.createElement('div');
  cap.textContent = 'Intensity';
  cap.style.cssText = `font-size:${7 * f}px;color:rgba(255,255,255,0.4);letter-spacing:0.08em;margin-bottom:2px`;
  container.appendChild(cap);

  // ── Geometry: boundary bbox + uniform scale, y flipped (north-up) ──────
  const { minX, minY, maxX, maxY } = polyBBox(poly);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);

  const svgW = Math.max(container.clientWidth || 200, 140);
  const svgH = Math.max(heightSetting - 16, 100);
  const pad = 4;
  const scale = Math.min((svgW - pad * 2) / spanX, (svgH - pad * 2) / spanY);
  const offX = (svgW - spanX * scale) / 2;
  const offY = (svgH - spanY * scale) / 2;
  const mapX = (x: number) => offX + (x - minX) * scale;
  const mapY = (y: number) => offY + (maxY - y) * scale;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(svgW));
  svg.setAttribute('height', String(svgH));
  svg.style.display = 'block';
  svg.setAttribute('shape-rendering', 'crispEdges');

  // Boundary polygon outline
  const pts = poly.map(([x, y]) => `${mapX(x).toFixed(1)},${mapY(y).toFixed(1)}`).join(' ');
  const polyEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polyEl.setAttribute('points', pts);
  polyEl.setAttribute('fill', 'none');
  polyEl.setAttribute('stroke', 'rgba(255,255,255,0.25)');
  polyEl.setAttribute('stroke-width', '1');
  svg.appendChild(polyEl);

  // Grid cells colored by intensity (index-aligned with cellData)
  const cellData = state.cellData ?? [];
  const cellSize = Math.max(grid.cellSize * scale * 0.92, 1);
  const half = cellSize / 2;

  for (let i = 0; i < grid.cells.length; i++) {
    const c = grid.cells[i];
    const intensity = cellData[i]?.intensity ?? 0;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', (mapX(c.cx) - half).toFixed(1));
    rect.setAttribute('y', (mapY(c.cy) - half).toFixed(1));
    rect.setAttribute('width', cellSize.toFixed(1));
    rect.setAttribute('height', cellSize.toFixed(1));
    rect.setAttribute('fill', intensityToColor(intensity, activePaletteId));
    rect.setAttribute('opacity', intensity > 0 ? (0.35 + 0.65 * intensity).toFixed(2) : '0.12');
    svg.appendChild(rect);
  }

  container.appendChild(svg);
}

function polyBBox(pts: Point2D[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

registerWidget(WIDGET_ID, renderMinimap);
