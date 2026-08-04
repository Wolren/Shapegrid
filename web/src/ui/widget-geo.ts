// ══════════════════════════════════════════════════════════════════════════════
// Widget: Geo - boundary / geographic info card (area, cell density, coverage)
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, widgetFontScale } from './dashboard';
import type { WidgetId, Point2D, GeoBounds } from '../types';

const WIDGET_ID: WidgetId = 'geo';

const COORD_LABELS: Record<string, string> = {
  auto: 'Auto',
  planar: 'Planar',
  wgs84: 'WGS84',
  mercator: 'Mercator',
};

function renderGeo(container: HTMLElement, _id: string): void {
  const f = widgetFontScale(WIDGET_ID);

  container.style.fontSize = (10 * f) + 'px';
  container.style.padding = '6px 8px';
  container.style.overflow = 'hidden';

  const poly = state.poly;

  if (!poly || poly.length < 3) {
    container.textContent = 'No boundary data';
    container.style.color = 'rgba(255,255,255,0.4)';
    container.style.fontStyle = 'italic';
    container.style.padding = '12px 8px';
    container.style.textAlign = 'center';
    return;
  }

  // Boundary name: country code > preset name > file name
  const boundaryName = state.country
    ? state.country
    : state.preset
      ? state.preset
      : state.fileName
        ? state.fileName
        : 'n/a';

  // Area: approximate km2 via shoelace over lon/lat when geo bounds are known,
  // otherwise the normalized polygon area.
  const gb = state.geoBounds;
  const cs = state.coordSystem;
  let areaText = 'n/a';
  let areaKm2: number | null = null;

  if (gb && (cs === 'wgs84' || cs === 'mercator')) {
    areaKm2 = geoAreaKm2(poly, gb);
    areaText = `≈ ${Math.round(areaKm2).toLocaleString()} km²`;
  } else {
    areaText = `${shoelaceArea(poly).toFixed(2)} (norm)`;
  }

  // Cell density: cells per km2 when a geo area is available.
  // Sparse grids read better as '1 per X km²' than as 0.001/km².
  const cells = state.grid?.cells ?? [];
  let densityText = 'n/a';
  if (areaKm2 !== null && areaKm2 > 0 && cells.length > 0) {
    const density = cells.length / areaKm2;
    if (density < 0.1) {
      densityText = `1 per ${Math.round(areaKm2 / cells.length).toLocaleString()} km²`;
    } else if (density < 10) {
      densityText = `${density.toFixed(2)}/km²`;
    } else {
      densityText = `${density.toFixed(1)}/km²`;
    }
  }

  // Coverage: active cells / total cells
  const cellData = state.cellData ?? [];
  const totalCells = state.grid?.cells?.length ?? cellData.length;
  const activeCells = cellData.filter(d => d.count > 0).length;
  const coveragePct = totalCells > 0 ? (activeCells / totalCells) * 100 : 0;
  const coverageText = `${Math.round(coveragePct)}%`;

  const rows: [string, string][] = [
    ['Boundary', boundaryName],
    ['Coordinate system', COORD_LABELS[cs ?? ''] ?? 'n/a'],
    ['Area', areaText],
    ['Cell density', densityText],
    ['Coverage', coverageText],
  ];

  // Label/value rows like widget-cell-info.ts
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px';

  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:8px';

    const l = document.createElement('span');
    l.style.cssText = `font-size:${9 * f}px;color:rgba(255,255,255,0.45);white-space:nowrap`;
    l.textContent = label;

    const v = document.createElement('span');
    v.style.cssText = `font-size:${11 * f}px;color:#e6edf3;font-weight:600;font-variant-numeric:tabular-nums;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:65%`;
    v.textContent = value;

    row.appendChild(l);
    row.appendChild(v);
    wrap.appendChild(row);
  }

  container.appendChild(wrap);
}

/** Absolute shoelace area of a closed polygon in coordinate units. */
function shoelaceArea(pts: Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/**
 * Approximate area in km2: map normalized poly coords to lon/lat via the geo
 * bounds, apply a cos(midLat) correction on longitude deltas, shoelace, then
 * scale by deg-to-km (1 deg lat ≈ 111.32 km, lon scaled by cos(midLat)).
 */
function geoAreaKm2(poly: Point2D[], gb: GeoBounds): number {
  const lon = (x: number) => gb.minLon + x * (gb.maxLon - gb.minLon);
  const lat = (y: number) => gb.minLat + y * (gb.maxLat - gb.minLat);
  const midLat = ((gb.minLat + gb.maxLat) / 2) * (Math.PI / 180);
  const cosMid = Math.cos(midLat);
  const pts = poly.map(([x, y]) => [lon(x) * cosMid, lat(y)] as Point2D);
  return shoelaceArea(pts) * 111.32 * 111.32;
}

registerWidget(WIDGET_ID, renderGeo);
