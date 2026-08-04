// ══════════════════════════════════════════════════════════════════════════════
// Widget: Coordinate Readout - Mouse position in planar or geo coordinates
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, getWidgetSetting, widgetFontScale } from './dashboard';
import type { CoordSystem, GeoBounds } from '../types';

// Mutable coordinate state updated by canvas mousemove
let _coordX = 0;
let _coordY = 0;
let _coordsBody: HTMLElement | null = null;

function renderCoords(container: HTMLElement, _id: string): void {
  const decimals = getWidgetSetting('coordinates', 'decimals', 2) as number;
  const f = widgetFontScale('coordinates');

  // Store reference for external updates
  _coordsBody = container;
  _coordsBody.id = 'coords-body';
  _coordsBody.style.fontSize = (10 * f) + 'px';
  _coordsBody.style.padding = '6px 8px';
  _coordsBody.style.whiteSpace = 'pre';
  _coordsBody.style.fontFamily = 'ui-monospace, SFMono-Regular, SF Mono, Consolas, monospace';
  _coordsBody.style.fontVariantNumeric = 'tabular-nums';
  _coordsBody.style.minWidth = '140px';

  // Initial display
  updateCoordDisplay(container, _coordX, _coordY, decimals);
}

function updateCoordDisplay(
  el: HTMLElement,
  x: number,
  y: number,
  decimals: number
): void {
  const cs: CoordSystem | null = state.coordSystem;
  const geo: GeoBounds | null = state.geoBounds;

  if (cs === 'wgs84' || cs === 'mercator') {
    // Geo coordinates - interpolate from normalized [0,1] to lon/lat
    const lon = geo ? lerp(geo.minLon, geo.maxLon, x) : x;
    const lat = geo ? lerp(geo.minLat, geo.maxLat, y) : y;
    el.textContent =
      `Lon: ${lon.toFixed(decimals)}\nLat: ${lat.toFixed(decimals)}`;
  } else {
    // Planar / normalized coordinates
    el.textContent =
      `X: ${x.toFixed(Math.max(decimals, 2))}\nY: ${y.toFixed(Math.max(decimals, 2))}`;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

registerWidget('coordinates', renderCoords);

/** Update coordinate display - call from canvas mousemove */
export function updateCoordWidget(x: number, y: number): void {
  _coordX = x;
  _coordY = y;

  const decimals = getWidgetSetting('coordinates', 'decimals', 2) as number;
  if (_coordsBody) {
    updateCoordDisplay(_coordsBody, x, y, decimals);
  }
}
