// ══════════════════════════════════════════════════════════════════════════════
// Distance and area measurement overlay for the 3D viewport
// ══════════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import {
  getEditor,
  startMeasurement,
  addMeasurementPoint,
} from './editor-state';
import { state } from './state';
import { geoKmPerUnit } from '../geometry/projection';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ACCENT = (): string => state.theme.accent;
// 15% alpha accent fill (hex + alpha suffix)
const ACCENT_ALPHA = (): string => `${state.theme.accent}26`;
const VERTEX_R = 4;
const LINE_W = 2;
const LABEL_OFFSET = 12;

let svg: SVGSVGElement | null = null;
let defsEl: SVGDefsElement | null = null;

// Resize observer to keep SVG synced to canvas
let resizeObs: ResizeObserver | null = null;

// ── Point representation for screen-space projection ────────────────────────

interface ScreenPoint {
  x: number;   // px relative to canvas
  y: number;
  world: THREE.Vector3;
}

// ── Initialisation ──────────────────────────────────────────────────────────

/**
 * Create the SVG measurement overlay and insert it into #canvas-wrap.
 * Returns a cleanup function.
 */
export function initMeasureOverlay(): () => void {
  if (svg) return () => { /* already initialised */ };

  const wrap = document.getElementById('canvas-wrap');
  if (!wrap) {
    console.warn('[measure] #canvas-wrap not found');
    return () => {};
  }

  const canvas = document.getElementById('canvas-main') as HTMLCanvasElement;
  if (!canvas) {
    console.warn('[measure] #canvas-main not found');
    return () => {};
  }

  svg = document.createElementNS(SVG_NS, 'svg');
  svg.id = 'measure-overlay';
  svg.setAttribute('style', `
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
    z-index: 15;
  `);

  // Defs for arrow markers
  defsEl = document.createElementNS(SVG_NS, 'defs');
  const marker = document.createElementNS(SVG_NS, 'marker');
  marker.setAttribute('id', 'measure-arrow');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('refX', '5');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const arrowPath = document.createElementNS(SVG_NS, 'path');
  arrowPath.setAttribute('d', 'M0,0 L6,3 L0,6 Z');
  arrowPath.setAttribute('fill', ACCENT());
  marker.appendChild(arrowPath);
  defsEl.appendChild(marker);
  svg.appendChild(defsEl);

  wrap.appendChild(svg);

  // Sync size with canvas via ResizeObserver
  resizeObs = new ResizeObserver(() => {
    if (svg) {
      svg.style.width = canvas.clientWidth + 'px';
      svg.style.height = canvas.clientHeight + 'px';
    }
  });
  resizeObs.observe(canvas);

  return () => {
    if (resizeObs) {
      resizeObs.disconnect();
      resizeObs = null;
    }
    if (svg && svg.parentNode) {
      svg.parentNode.removeChild(svg);
    }
    svg = null;
    defsEl = null;
  };
}

// ── World → screen projection ───────────────────────────────────────────────

function worldToScreen(
  world: THREE.Vector3,
  camera: THREE.Camera,
  canvasRect: DOMRect
): { x: number; y: number } | null {
  const vec = world.clone().project(camera);
  // NDC → pixel
  const x = (vec.x * 0.5 + 0.5) * canvasRect.width;
  const y = (-vec.y * 0.5 + 0.5) * canvasRect.height;
  // Discard points behind the camera
  if (vec.z > 1) return null;
  return { x, y };
}

// ── Ground-plane raycast ────────────────────────────────────────────────────

const _ray = new THREE.Raycaster();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0
const _mouse = new THREE.Vector2();

/**
 * Cast a ray from mouse coordinates in the canvas and intersect with the y=0
 * ground plane. Returns the world-space intersection point or null.
 */
function intersectGround(
  mouseX: number,
  mouseY: number,
  canvasRect: DOMRect,
  camera: THREE.Camera
): THREE.Vector3 | null {
  _mouse.x = ((mouseX - canvasRect.left) / canvasRect.width) * 2 - 1;
  _mouse.y = -((mouseY - canvasRect.top) / canvasRect.height) * 2 + 1;

  _ray.setFromCamera(_mouse, camera);

  const target = new THREE.Vector3();
  const hit = _ray.ray.intersectPlane(_plane, target);
  return hit;
}

// ── Drawing helpers ─────────────────────────────────────────────────────────

function createLine(points: ScreenPoint[], closed = false): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');

  if (points.length < 2) return g;

  const d = points.map((p, i) =>
    i === 0 ? `M ${p.x.toFixed(1)},${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`
  ).join(' ');
  let pathD = d;
  if (closed && points.length > 2) {
    pathD += ' Z';
  }

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathD);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', ACCENT());
  path.setAttribute('stroke-width', String(LINE_W));
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('marker-end', 'url(#measure-arrow)');
  g.appendChild(path);

  return g;
}

function createPolygonFill(points: ScreenPoint[]): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');

  if (points.length < 3) return g;

  const d = points.map((p, i) =>
    i === 0 ? `M ${p.x.toFixed(1)},${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`
  ).join(' ') + ' Z';

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', ACCENT_ALPHA());
  path.setAttribute('stroke', ACCENT());
  path.setAttribute('stroke-width', String(LINE_W));
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  g.appendChild(path);

  return g;
}

function createVertices(points: ScreenPoint[]): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');

  points.forEach((p) => {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', p.x.toFixed(1));
    circle.setAttribute('cy', p.y.toFixed(1));
    circle.setAttribute('r', String(VERTEX_R));
    circle.setAttribute('fill', ACCENT());
    circle.setAttribute('opacity', '0.9');
    g.appendChild(circle);
  });

  return g;
}

function createLabel(
  text: string,
  screenPts: ScreenPoint[],
  _camera: THREE.Camera,
  canvasRect: DOMRect
): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');

  // Place label near the last point
  const last = screenPts[screenPts.length - 1];
  if (!last) return g;

  // Offset to avoid overlapping the last vertex
  let labelX = last.x + LABEL_OFFSET;
  let labelY = last.y - LABEL_OFFSET;

  // Clamp to viewport
  const pad = 40;
  if (labelX + 80 > canvasRect.width) labelX = last.x - 80;
  if (labelY < pad) labelY = last.y + LABEL_OFFSET;

  // Background rect
  const textW = text.length * 6.5 + 8;
  const textH = 16;
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', (labelX - 4).toFixed(1));
  rect.setAttribute('y', (labelY - textH + 4).toFixed(1));
  rect.setAttribute('width', String(textW));
  rect.setAttribute('height', String(textH));
  rect.setAttribute('rx', '3');
  rect.setAttribute('fill', 'rgba(13, 17, 23, 0.8)');
  rect.setAttribute('stroke', ACCENT());
  rect.setAttribute('stroke-width', '1');
  g.appendChild(rect);

  // Text
  const txt = document.createElementNS(SVG_NS, 'text');
  txt.setAttribute('x', labelX.toFixed(1));
  txt.setAttribute('y', labelY.toFixed(1));
  txt.setAttribute('fill', '#e6edf3');
  txt.setAttribute('font-family', "'IBM Plex Mono', monospace");
  txt.setAttribute('font-size', '9');
  txt.setAttribute('alignment-baseline', 'baseline');
  txt.textContent = text;
  g.appendChild(txt);

  return g;
}

// ── Geo-aware formatting ────────────────────────────────────────────────────

/**
 * Conversion factors from normalized world units to km / km², or null when
 * no geographic data is loaded (normalized units stay as-is in that case).
 */
function geoConversion(): { kmPerUnitX: number; kmPerUnitY: number } | null {
  return geoKmPerUnit(state.geoBounds, state.coordSystem);
}

/** Adaptive decimals: sub-10 values get 2, larger values get 1. */
function geoDecimals(v: number): number {
  return v < 10 ? 2 : 1;
}

function formatGeoDistance(v: number): string {
  return `${v.toFixed(geoDecimals(v))} km`;
}

function formatGeoArea(v: number): string {
  return `${v.toFixed(geoDecimals(v))} km²`;
}

/**
 * Convert a polyline length in normalized units to km.
 * Exact for wgs84 (kmPerUnitX === kmPerUnitY); for mercator the y-axis scale
 * is 57.3x the x-axis scale, so the average is a documented approximation
 * for mixed directions (per-axis factors would need per-segment deltas).
 */
function geoDistance(v: number): number {
  const g = geoConversion();
  if (!g) return v;
  return v * ((g.kmPerUnitX + g.kmPerUnitY) / 2);
}

/** Convert a shoelace area in normalized units squared to km². */
function geoArea(v: number): number {
  const g = geoConversion();
  if (!g) return v;
  return v * g.kmPerUnitX * g.kmPerUnitY;
}

function formatDistanceValue(v: number | undefined): string {
  if (v === undefined) return 'n/a';
  return geoConversion() ? formatGeoDistance(geoDistance(v)) : v.toFixed(2);
}

function formatAreaValue(v: number | undefined): string {
  if (v === undefined) return 'n/a';
  return geoConversion() ? formatGeoArea(geoArea(v)) : v.toFixed(2);
}

// ── Measurement rendering ───────────────────────────────────────────────────

function pointsToScreen(
  points: Array<[number, number]>,
  camera: THREE.Camera,
  canvasRect: DOMRect
): ScreenPoint[] {
  return points
    .map(([x, z]) => {
      const world = new THREE.Vector3(x - 0.5, 0, z - 0.5);
      const screen = worldToScreen(world, camera, canvasRect);
      if (!screen) return null;
      return { x: screen.x, y: screen.y, world };
    })
    .filter((p): p is ScreenPoint => p !== null);
}

/**
 * Redraw all completed measurements and the active in-progress measurement.
 */
export function updateMeasureOverlay(
  camera: THREE.Camera,
  canvasRect: DOMRect
): void {
  if (!svg) return;

  // Clear previous content (keep defs)
  while (svg.childNodes.length > 1) {
    svg.removeChild(svg.lastChild!);
  }

  const editor = getEditor();
  const canvasW = canvasRect.width;
  const canvasH = canvasRect.height;

  // Update SVG viewport
  svg.setAttribute('viewBox', `0 0 ${canvasW} ${canvasH}`);

  // ── Completed measurements ──────────────────────────────────────────────
  for (const m of editor.measurements) {
    const screenPts = pointsToScreen(m.points, camera, canvasRect);
    if (screenPts.length < 2) continue;

    if (m.type === 'area') {
      const fillG = createPolygonFill(screenPts);
      svg.appendChild(fillG);
    } else {
      const lineG = createLine(screenPts, false);
      svg.appendChild(lineG);
    }

    const vertexG = createVertices(screenPts);
    svg.appendChild(vertexG);

    // Label
    const label = m.type === 'distance'
      ? `Dist: ${formatDistanceValue(m.distance)}`
      : `Area: ${formatAreaValue(m.area)}`;
    const labelG = createLabel(label, screenPts, camera, canvasRect);
    svg.appendChild(labelG);
  }

  // ── Active measurement (in progress) ────────────────────────────────────
  const am = editor.activeMeasurement;
  if (am && am.points.length > 0) {
    const screenPts = pointsToScreen(am.points, camera, canvasRect);
    if (screenPts.length >= 1) {
      // Hover-cursor at the last point (dashed line from last vertex to cursor is
      // handled externally — we just draw the committed points)

      if (screenPts.length >= 2) {
        if (am.type === 'area') {
          const fillG = createPolygonFill(screenPts);
          svg.appendChild(fillG);
        } else {
          const lineG = createLine(screenPts, false);
          svg.appendChild(lineG);
        }
      }

      const vertexG = createVertices(screenPts);
      svg.appendChild(vertexG);

      // Live label
      let liveLabel: string;
      if (am.type === 'distance') {
        if (am.distance !== undefined) {
          liveLabel = `Dist: ${formatDistanceValue(am.distance)}`;
        } else {
          liveLabel = 'Dist: n/a';
        }
      } else {
        if (am.area !== undefined) {
          liveLabel = `Area: ${formatAreaValue(am.area)}`;
        } else if (am.points.length >= 2) {
          // Show running distance until area is computable
          const last = am.points[am.points.length - 1];
          const prev = am.points[am.points.length - 2];
          const dx = last[0] - prev[0];
          const dy = last[1] - prev[1];
          liveLabel = `Edge: ${formatDistanceValue(Math.sqrt(dx * dx + dy * dy))}`;
        } else {
          liveLabel = 'Area: n/a';
        }
      }
      const labelG = createLabel(liveLabel, screenPts, camera, canvasRect);
      svg.appendChild(labelG);
    }
  }
}

// ── Click handler ──────────────────────────────────────────────────────────

/**
 * Handle a canvas click for the measurement tool. Should be called from the
 * canvas mousedown/mouseup event handler when the active tool is a measurement.
 *
 * @returns true if the event was consumed (measurement action taken)
 */
export function handleMeasureClick(
  mouseX: number,
  mouseY: number,
  canvasRect: DOMRect,
  camera: THREE.Camera
): boolean {
  const editor = getEditor();
  const tool = editor.activeTool;
  if (tool !== 'measureDistance' && tool !== 'measureArea') return false;

  // Cast ray to ground plane
  const worldPt = intersectGround(mouseX, mouseY, canvasRect, camera);
  if (!worldPt) return false;

  // Convert to grid coordinates (cx, cy) — note cells sit on y=0, centered at cx-0.5, cy-0.5
  const gx = worldPt.x + 0.5;
  const gz = worldPt.z + 0.5;

  // Start a new measurement if none active
  if (!editor.activeMeasurement) {
    const measureType = tool === 'measureDistance' ? 'distance' : 'area';
    startMeasurement(measureType);
    // First point (addMeasurementPoint handles adding to points array)
    addMeasurementPoint(gx, gz);
  } else {
    // Add point to active measurement
    addMeasurementPoint(gx, gz);
  }

  return true;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Remove all measurement visuals from the overlay. */
export function clearMeasureOverlay(): void {
  if (!svg) return;
  while (svg.childNodes.length > 1) {
    svg.removeChild(svg.lastChild!);
  }
}

/** Returns true if a measurement is currently in progress. */
export function isMeasuring(): boolean {
  return getEditor().activeMeasurement !== null;
}
