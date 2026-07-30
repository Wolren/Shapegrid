// ══════════════════════════════════════════════════════════════════════════════
// Widget: Overview — Mini 2D top-down map of boundary shape + grid overlay
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, renderAllWidgets } from './dashboard';
import type { Point2D, Cell } from '../types';

function renderOverview(container: HTMLElement, _id: string): void {
  container.style.fontSize = '10px';
  container.style.padding = '4px';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';

  const poly = state.poly ?? [];
  const cells = state.grid?.cells ?? [];

  if (poly.length < 3) {
    container.textContent = 'No boundary loaded';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
    return;
  }

  // Compute bounding box of polygon (and cells for safety)
  const bbox = computeBBox(poly, cells);

  // Guard against degenerate bounds
  const rangeX = Math.max(bbox.maxX - bbox.minX, 1e-6);
  const rangeY = Math.max(bbox.maxY - bbox.minY, 1e-6);

  // SVG dimensions: 100% width, max 80px height, maintain aspect ratio
  const maxH = 80;
  const svgW = Math.min(maxH * (rangeX / rangeY), 180);
  const svgH = svgW * (rangeY / rangeX);
  const finalH = Math.min(svgH, maxH);
  const finalW = finalH * (rangeX / rangeY);

  // Padding inside SVG (so strokes on boundary aren't clipped)
  const pad = 4;
  const viewW = finalW + pad * 2;
  const viewH = finalH + pad * 2;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', `${Math.round(finalW)}`);
  svg.setAttribute('height', `${Math.round(finalH)}`);
  svg.setAttribute('viewBox', `0 0 ${viewW} ${viewH}`);
  svg.style.display = 'block';
  svg.setAttribute('shape-rendering', 'crispEdges');

  // Helper: map a coordinate to SVG space
  const scaleX = (nx: number) => pad + ((nx - bbox.minX) / rangeX) * finalW;
  const scaleY = (ny: number) => pad + ((ny - bbox.minY) / rangeY) * finalH;

  // --- Boundary polygon (outlined, no fill) ---
  const polyPoints = poly
    .map(p => `${scaleX(p[0]).toFixed(2)},${scaleY(p[1]).toFixed(2)}`)
    .join(' ');

  const boundary = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  boundary.setAttribute('points', polyPoints);
  boundary.setAttribute('fill', 'transparent');
  boundary.setAttribute('stroke', '#666666');
  boundary.setAttribute('stroke-width', '1');
  svg.appendChild(boundary);

  // --- Grid cells as small filled circles ---
  for (const cell of cells) {
    const cx = scaleX(cell.cx);
    const cy = scaleY(cell.cy);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', cx.toFixed(2));
    dot.setAttribute('cy', cy.toFixed(2));
    dot.setAttribute('r', '1');
    dot.setAttribute('fill', '#26a641');
    dot.setAttribute('stroke', 'none');
    svg.appendChild(dot);
  }

  container.appendChild(svg);
}

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function computeBBox(poly: Point2D[], cells: Cell[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of poly) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }

  // Also consider cells in case poly has no data but cells do
  for (const c of cells) {
    if (c.cx < minX) minX = c.cx;
    if (c.cx > maxX) maxX = c.cx;
    if (c.cy < minY) minY = c.cy;
    if (c.cy > maxY) maxY = c.cy;
  }

  // Fallback if everything is empty
  if (!isFinite(minX)) {
    minX = -0.5; minY = -0.5; maxX = 0.5; maxY = 0.5;
  }

  // Add a small margin
  const mx = (maxX - minX) * 0.05 || 0.05;
  const my = (maxY - minY) * 0.05 || 0.05;
  return { minX: minX - mx, minY: minY - my, maxX: maxX + mx, maxY: maxY + my };
}

registerWidget('overview', renderOverview);

export function updateOverviewWidget(): void {
  renderAllWidgets();
}
