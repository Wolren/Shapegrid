// ══════════════════════════════════════════════════════════════════════════════
// Shapegrid - Main Application Entry Point
// Three.js scene setup, camera controls, and UI wiring
// ══════════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import type { Point2D } from './src/types';
import { state, updateState, setPreset } from './src/ui/state';
import { norm, normWithCoordSystem, isLikelyLonLat } from './src/geometry/projection';
import { parseGeoJsonFile, parseSvgFile } from './src/geometry/parsers';
import { intensityToColor, colToHex, activePaletteId, setActivePalette, buildLegend } from './src/rendering/colors';
import { loadDemo, computeGrid, loadData, setStatus, loadFromUrl } from './src/ui/data';
import { createPresets } from './src/data/presets';
import { initPaletteUI } from './src/ui/palette-ui';
import { scheduleRebuild, needsRebuild } from './src/ui/rebuild';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { COUNTRIES, searchCountries, getCountryList, initCountries } from './src/data/countries';
import { initToolbar, syncToolbarState } from './src/ui/toolbar';
import { initMeasureOverlay, updateMeasureOverlay, handleMeasureClick, clearMeasureOverlay, isMeasuring } from './src/ui/measure';
import { getEditor, setSelectedCells, cancelMeasurement } from './src/ui/editor-state';
import { updateCellInfoWidget } from './src/ui/widget-cell-info';
import { initWidgetManager } from './src/ui/widget-manager';
import { fetchAndUpdateLanguages } from './src/ui/github-langs';
import { renderAllWidgets } from './src/ui/dashboard';
import './src/ui/widget-legend';
import './src/ui/widget-stats';
import './src/ui/widget-languages';
import './src/ui/widget-cell-info';
import './src/ui/widget-scale';
import './src/ui/widget-coords';
import './src/ui/widget-distribution';
import './src/ui/widget-timeline';
import './src/ui/widget-activity';
import './src/ui/widget-overview';

// ══════════════════════════════════════════════════════════════════════════════
// Three.js Scene
// ══════════════════════════════════════════════════════════════════════════════

const canvas = document.getElementById('canvas-main') as HTMLCanvasElement;
let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.OrthographicCamera;
let dirLight: THREE.DirectionalLight, mesh: THREE.InstancedMesh | null, boundaryLine: THREE.LineLoop | null;
let groundMesh: THREE.Mesh;
let coordAxesGroup: THREE.Group | null;
let composer: EffectComposer | null = null;
// Initialize presets after norm is available
createPresets(norm);

function initThree() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();

  const W = canvas.clientWidth, H = canvas.clientHeight;
  const asp = W / H, fs = 1.3;
  camera = new THREE.OrthographicCamera(-fs * asp / 2, fs * asp / 2, fs / 2, -fs / 2, 0.01, 100);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(2, 4, 3);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  scene.add(dirLight);
  const fill = new THREE.DirectionalLight(0x6688cc, 0.25);
  fill.position.set(-2, 2, -3);
  scene.add(fill);

  // Ground
  const gGeo = new THREE.PlaneGeometry(4, 4);
  const gMat = new THREE.ShadowMaterial({ opacity: 0.12 });
  groundMesh = new THREE.Mesh(gGeo, gMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // Post-processing pipeline
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
    state.bloomStrength,
    state.bloomRadius,
    state.bloomThreshold
  );
  bloomPass.strength = state.bloomEnabled ? state.bloomStrength : 0;
  bloomNode = bloomPass;
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  loop();
}

function posCamera() {
  const yaw = (state.yaw * Math.PI) / 180;
  const pitch = (state.pitch * Math.PI) / 180;
  const dist = 2.5;
  camera.position.set(
    dist * Math.sin(yaw) * Math.cos(pitch),
    dist * Math.sin(pitch),
    dist * Math.cos(yaw) * Math.cos(pitch)
  );
  camera.lookAt(0, 0, 0);
  camera.up.set(0, 1, 0);

  // Resize ortho cam to match canvas
  const W = canvas.clientWidth, H = canvas.clientHeight, asp = W / H, fs = state.zoom;
  camera.left = -fs * asp / 2; camera.right = fs * asp / 2;
  camera.top = fs / 2; camera.bottom = -fs / 2;
  camera.updateProjectionMatrix();
}

function buildMesh() {
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh = null; }
  if (boundaryLine) { scene.remove(boundaryLine); boundaryLine.geometry.dispose(); boundaryLine = null; }

  if (!state.grid) return;

  const { cells, cellSize, gridType } = state.grid;
  const N = cells.length;
  const hs = state.heightScale;
  const gap = state.gap;

  // Apply intensity scaling
  const scaleIntensity = (raw: number): number => {
    const clamped = Math.max(0, Math.min(1, raw));
    switch (state.scaleMode) {
      case 'sqrt': return Math.sqrt(clamped);
      case 'cbrt': return Math.cbrt(clamped);
      case 'log': return clamped <= 0 ? 0 : Math.log(1 + clamped * 9) / Math.log(10);
      case 'quad': return clamped * clamped;
      case 'inverse': return 1 - clamped;
      default: return clamped;
    }
  };

  // Geometry
  let geo: THREE.BufferGeometry;
  if (gridType === 'square') {
    const s = cellSize * (1 - gap);
    geo = new THREE.BoxGeometry(s, 1, s);
  } else {
    // Hex grid from genHex spaces cells cs*0.75 apart horizontally.
    // CylinderGeometry hexagon's flat-to-flat width = r * sqrt(3).
    // For touching: r * sqrt(3) = cs * 0.75  →  r = cs * 0.75 / sqrt(3)
    const r = cellSize * (0.75 / Math.sqrt(3)) * (1 - gap);
    geo = new THREE.CylinderGeometry(r, r, 1, 6);
  }

  const mat = new THREE.MeshLambertMaterial();
  mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.castShadow = true;

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  cells.forEach((cell, i) => {
    const d = state.cellData[i] || { intensity: 0, count: 0 };
    const scaled = scaleIntensity(d.intensity);
    const h = Math.max(0.008, scaled * hs * 0.12 + 0.008);
    dummy.position.set(cell.cx - .5, h / 2, cell.cy - .5);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    mesh!.setMatrixAt(i, dummy.matrix);

    const css = intensityToColor(scaled, activePaletteId);
    const [r, g, b] = colToHex(css);
    col.setRGB(r, g, b);
    mesh!.setColorAt(i, col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  // Boundary outline
  if (state.showBoundary && getEditor().layerVisibility.boundary) {
    const pts = state.poly.map(([x, y]) => new THREE.Vector3(x - .5, 0.02, y - .5));
    const bGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const bMat = new THREE.LineBasicMaterial({ color: 0x666666 });
    boundaryLine = new THREE.LineLoop(bGeo, bMat);
    scene.add(boundaryLine);
  }

  // Coordinate axes for geographic data
  buildCoordAxes();
}

function createTextSprite(text: string, color = '#888888', scale = 1.0): THREE.Sprite {
  const canvas2d = document.createElement('canvas');
  const ctx = canvas2d.getContext('2d')!;
  const fontSize = 48;
  ctx.font = `${fontSize}px "IBM Plex Mono", monospace`;
  const metrics = ctx.measureText(text);
  const width = Math.ceil(metrics.width) + 8;
  const height = fontSize + 8;
  canvas2d.width = width;
  canvas2d.height = height;
  ctx.font = `${fontSize}px "IBM Plex Mono", monospace`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 4, height / 2);

  const texture = new THREE.CanvasTexture(canvas2d);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  const baseScale = scale * 0.15;
  sprite.scale.set(width / 400 * baseScale, height / 400 * baseScale, 1);
  return sprite;
}

function formatCoord(value: number, isLat: boolean): string {
  const absVal = Math.abs(value);
  const dir = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  return `${absVal.toFixed(1)}°${dir}`;
}

function buildCoordAxes() {
  if (coordAxesGroup) {
    scene.remove(coordAxesGroup);
    coordAxesGroup.traverse(obj => {
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      const sprite = obj as THREE.Sprite;
      if (sprite.material) {
        if (sprite.material.map) sprite.material.map.dispose();
        sprite.material.dispose();
      }
    });
  }

  const isGeo = state.coordSystem === 'wgs84' || state.coordSystem === 'mercator';
  const isFileLoaded = state.fileType !== null;
  if (!isGeo || !state.geoBounds || !state.showCoordAxes || !isFileLoaded || !getEditor().layerVisibility.axes) return;

  coordAxesGroup = new THREE.Group();
  const { minLon, maxLon, minLat, maxLat } = state.geoBounds!;
  const axisColor = state.coordAxesLineColor;
  const labelColor = state.coordAxesLabelColor;
  const labelScale = state.coordAxesScale;
  const y = 0.01;
  const isOutside = state.coordAxesPosition === 'outside';
  const xOff = state.coordAxesXOffset ?? 0.04;
  const yOff = state.coordAxesYOffset ?? 0.04;
  const tickL = state.coordAxesTickLength ?? 0.015;
  const labelOff = state.coordAxesLabelOffset ?? 0.03;
  const tickLen = isOutside ? tickL : -tickL;
  const labelOffset = isOutside ? labelOff : -labelOff;
  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;
  const maxSpan = Math.max(lonSpan, latSpan);
  const normW = lonSpan / maxSpan;
  const normH = latSpan / maxSpan;

  const left = -normW / 2;
  const right = normW / 2;
  const top = -normH / 2;
  const bottom = normH / 2;

  // X offset moves things horizontally, Y offset moves things vertically
  // Both axes share the same corner point so they stay connected as an L
  const cornerX = left - (isOutside ? yOff : -yOff);
  const cornerZ = bottom + (isOutside ? xOff : -xOff);

  const lineMat = new THREE.LineBasicMaterial({ color: axisColor });

  // Bottom axis line (longitude) — from corner to right
  const bottomLine = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cornerX, y, cornerZ),
    new THREE.Vector3(right, y, cornerZ)
  ]);
  coordAxesGroup.add(new THREE.Line(bottomLine, lineMat));

  // Left axis line (latitude) — from top to corner
  const leftLine = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cornerX, y, top),
    new THREE.Vector3(cornerX, y, cornerZ)
  ]);
  coordAxesGroup.add(new THREE.Line(leftLine, lineMat));

  function niceInterval(range: number, targetTicks = 4): number {
    const rough = range / targetTicks;
    const exp = Math.floor(Math.log10(rough));
    const frac = rough / Math.pow(10, exp);
    let nice;
    if (frac <= 1.5) nice = 1;
    else if (frac <= 3) nice = 2;
    else if (frac <= 7) nice = 5;
    else nice = 10;
    return nice * Math.pow(10, exp);
  }

  // Longitude ticks (bottom) — at original grid positions, Z = cornerZ
  const lonInterval = niceInterval(lonSpan);
  const lonStart = Math.ceil(minLon / lonInterval) * lonInterval;
  for (let lon = lonStart, i = 0; lon <= maxLon + lonInterval * 0.01; lon = lonStart + i * lonInterval, i++) {
    const t = (lon - minLon) / lonSpan;
    const x = left + t * normW;

    const tick = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, y, cornerZ),
      new THREE.Vector3(x, y, cornerZ + tickLen)
    ]);
    coordAxesGroup.add(new THREE.Line(tick, lineMat));

    // Round to avoid floating point display issues
    const roundedLon = Math.round(lon * 1000) / 1000;
    const label = createTextSprite(formatCoord(roundedLon, false), labelColor, labelScale);
    label.position.set(x, y, cornerZ + tickLen + labelOffset);
    coordAxesGroup.add(label);
  }

  // Latitude ticks (left side) — at original grid positions, X = cornerX
  const latInterval = niceInterval(latSpan);
  const latStart = Math.ceil(minLat / latInterval) * latInterval;
  for (let lat = latStart, i = 0; lat <= maxLat + latInterval * 0.01; lat = latStart + i * latInterval, i++) {
    const t = (lat - minLat) / latSpan;
    const z = bottom - t * normH;

    const tick = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cornerX, y, z),
      new THREE.Vector3(cornerX - tickLen, y, z)
    ]);
    coordAxesGroup.add(new THREE.Line(tick, lineMat));

    // Round to avoid floating point display issues
    const roundedLat = Math.round(lat * 1000) / 1000;
    const label = createTextSprite(formatCoord(roundedLat, true), labelColor, labelScale);
    label.position.set(cornerX - tickLen - labelOffset, y, z);
    coordAxesGroup.add(label);
  }

  scene.add(coordAxesGroup);
}

// ── Post-processing state ────────────────────────────────────────────────
let bloomNode: any = null;

function applyPostProcessing() {
  if (!renderer || !scene) return;
  // Bloom
  if (bloomNode) {
    bloomNode.strength = state.bloomEnabled ? state.bloomStrength : 0;
    bloomNode.radius = state.bloomRadius;
    bloomNode.threshold = state.bloomThreshold;
  }
  // Fog
  if (state.fogEnabled && !scene.fog) {
    scene.fog = new THREE.FogExp2(state.background, state.fogDensity);
  } else if (state.fogEnabled && scene.fog) {
    (scene.fog as THREE.FogExp2).density = state.fogDensity;
  } else if (!state.fogEnabled) {
    scene.fog = null;
  }
  // Tone mapping
  renderer.toneMapping = state.toneMapping as THREE.ToneMapping;
  renderer.toneMappingExposure = 1.0;
  // Environment map - toggle visibility
  if (state.envMapEnabled && !scene.environment) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileCubemapShader();
    // Use a simple neutral env map
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTexture.texture;
    pmremGenerator.dispose();
  } else if (!state.envMapEnabled) {
    scene.environment = null;
  }
}

function loop() {
  requestAnimationFrame(loop);
  const pr = renderer.getPixelRatio();
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const targetW = Math.floor(W * pr), targetH = Math.floor(H * pr);
  if (renderer.domElement.width !== targetW || renderer.domElement.height !== targetH) {
    renderer.setSize(W, H, false);
    if (composer) {
      composer.setSize(W * pr, H * pr);
    }
    posCamera();
  }
  if (needsRebuild()) {
    buildMesh();
  }
  applyPostProcessing();
  // Clear to background — use renderer.clearColor (matches original pre-composer path)
  // Don't set scene.background (it goes through color space conversion differently)
  renderer.setClearColor(state.background, 1);

  // Skip composer when all effects are off — matches original direct render path
  const effectsActive = (composer !== null) && (state.bloomEnabled || state.toneMapping !== 0 || state.fogEnabled || state.envMapEnabled);
  if (effectsActive) {
    composer!.render();
  } else {
    renderer.render(scene, camera);
  }
  // Update measurement overlay when measuring
  const editor = getEditor();
  if (editor.activeMeasurement || editor.measurements.length > 0) {
    const rect = canvas.getBoundingClientRect();
    updateMeasureOverlay(camera, rect);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Camera drag controls
// ══════════════════════════════════════════════════════════════════════════════

let drag = { active: false, lx: 0, ly: 0 };

canvas.addEventListener('mousedown', e => { drag = { active: true, lx: e.clientX, ly: e.clientY }; });
window.addEventListener('mouseup', () => { drag.active = false; });
window.addEventListener('mousemove', e => {
  if (!drag.active) return;
  const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
  drag.lx = e.clientX; drag.ly = e.clientY;
  updateState('yaw', parseFloat((((state.yaw + dx * .4 + 360) % 360).toFixed(1))));
  updateState('pitch', parseFloat((Math.max(5, Math.min(89, state.pitch - dy * .3))).toFixed(1)));
  syncToDom('yaw'); syncToDom('pitch');
  posCamera();
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 1.08 : 0.93;
  state.zoom = Math.max(0.5, Math.min(4, state.zoom * delta));
  const asp = canvas.clientWidth / canvas.clientHeight;
  camera.left = -state.zoom * asp / 2; camera.right = state.zoom * asp / 2;
  camera.top = state.zoom / 2; camera.bottom = -state.zoom / 2;
  camera.updateProjectionMatrix();
}, { passive: false });

// ══════════════════════════════════════════════════════════════════════════════
// Tooltip on canvas hover
// ══════════════════════════════════════════════════════════════════════════════

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.getElementById('tooltip')!;

canvas.addEventListener('mousemove', e => {
  if (!mesh || drag.active) { tooltip.classList.remove('visible'); return; }
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(mesh);
  if (hits.length > 0) {
    const idx = hits[0].instanceId;
    if (idx !== undefined) {
      const d = state.cellData[idx];
      if (d) {
        tooltip.innerHTML = d.date
          ? `<strong>${d.date}</strong><br/>${d.count} contribution${d.count !== 1 ? 's' : ''}`
          : `<span style="color:var(--muted)">No data</span>`;
        tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
        tooltip.style.top = (e.clientY - rect.top - 28) + 'px';
        tooltip.classList.add('visible');
        if (getEditor().activeTool === 'select') {
          setSelectedCells([idx]);
          updateCellInfoWidget();
        }
        return;
      }
    }
  }
  tooltip.classList.remove('visible');
});
canvas.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));

// ══════════════════════════════════════════════════════════════════════════════
// Measurement tool — click handling on canvas
// ══════════════════════════════════════════════════════════════════════════════

let measureDragActive = false;

canvas.addEventListener('mousedown', () => {
  // Track whether this turns into a drag
  measureDragActive = false;
});

canvas.addEventListener('mousemove', e => {
  // If mouse moves too far during a measure click, cancel it
  if (getEditor().activeTool === 'measureDistance' || getEditor().activeTool === 'measureArea') {
    if (e.buttons > 0) measureDragActive = true;
  }
});

canvas.addEventListener('mouseup', e => {
  if (measureDragActive) return; // Was a camera drag, not a click
  const tool = getEditor().activeTool;
  if (tool === 'measureDistance' || tool === 'measureArea') {
    const rect = canvas.getBoundingClientRect();
    const handled = handleMeasureClick(e.clientX, e.clientY, rect, camera);
    if (handled) {
      updateMeasureOverlay(camera, rect);
    }
  } else if (tool === 'select' && mesh) {
    // Select cell under cursor
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
    const hits = raycaster.intersectObject(mesh);
    if (hits.length > 0) {
      const idx = hits[0].instanceId;
      if (idx !== undefined) {
        setSelectedCells([idx]);
        updateCellInfoWidget();
      }
    } else {
      setSelectedCells([]);
      updateCellInfoWidget();
    }
  }
});

// Keyboard: Escape cancels measurement
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (isMeasuring()) {
      cancelMeasurement();
      clearMeasureOverlay();
    }
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Draggable overlays (legend, stats bar)
// ══════════════════════════════════════════════════════════════════════════════

interface DragState {
  el: HTMLElement;
  key: 'legend' | 'stats';
  lx: number;
  ly: number;
  startX: number;
  startY: number;
}

let overlayDrag: DragState | null = null;

function initOverlayDrag() {
  // Make the whole legend/stats elements draggable
  const legend = document.getElementById('legend');
  const stats = document.getElementById('stats-bar');

  [legend, stats].forEach(el => {
    if (!el) return;
    const key = el.id === 'legend' ? 'legend' : 'stats';
    el.addEventListener('mousedown', e => {
      // Don't drag when clicking toggle/link/etc (only on the element background)
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.tagName === 'INPUT') return;
      e.preventDefault();
      overlayDrag = {
        el,
        key,
        lx: e.clientX,
        ly: e.clientY,
        startX: state.overlay[`${key}Pos`].x,
        startY: state.overlay[`${key}Pos`].y,
      };
      el.classList.add('dragging');
    });
  });
}

window.addEventListener('mousemove', e => {
  if (!overlayDrag) return;
  const wrap = document.getElementById('canvas-wrap')!;
  const rect = wrap.getBoundingClientRect();
  const dx = e.clientX - overlayDrag.lx;
  const dy = e.clientY - overlayDrag.ly;
  const pctX = (dx / rect.width) * 100;
  const pctY = (dy / rect.height) * 100;
  const posKey = `${overlayDrag.key}Pos` as 'legendPos' | 'statsPos';
  const newX = Math.max(0, Math.min(95, overlayDrag.startX + pctX));
  const newY = Math.max(0, Math.min(90, overlayDrag.startY + pctY));
  state.overlay[posKey] = { x: newX, y: newY };
  overlayDrag.el.style.left = newX + '%';
  overlayDrag.el.style.top = newY + '%';
});

window.addEventListener('mouseup', () => {
  if (!overlayDrag) return;
  overlayDrag.el.classList.remove('dragging');
  overlayDrag = null;
});

// ══════════════════════════════════════════════════════════════════════════════
// Export Config JSON
// ══════════════════════════════════════════════════════════════════════════════

function exportConfig() {
  const config = {
    version: 2,
    generated: new Date().toISOString(),
    username: state.contributions?.username || '',
    totalContributions: state.contributions?.total || 0,
    boundary: state.poly,
    geoBounds: state.geoBounds || undefined,
    coordSystem: state.coordSystem || undefined,
    grid: state.grid ? {
      type: state.grid.gridType,
      count: state.count,
      cellSize: state.grid.cellSize,
      cells: state.grid.cells.map((c, i) => ({
        cx: c.cx, cy: c.cy,
        date: state.cellData[i]?.date || '',
        count: state.cellData[i]?.count || 0,
        intensity: state.cellData[i]?.intensity || 0,
      })),
    } : null,
    config: {
      camera: { yaw: state.yaw, pitch: state.pitch },
      render: {
        heightScale: state.heightScale,
        showBoundary: state.showBoundary,
        background: state.background,
        gap: state.gap,
      },
      theme: { palette: state.palette },
      overlay: {
        legendPos: state.overlay.legendPos,
        statsPos: state.overlay.statsPos,
        showLegend: state.overlay.showLegend,
        showStats: state.overlay.showStats,
        legendFontSize: state.overlay.legendFontSize,
        legendBarWidth: state.overlay.legendBarWidth,
        statsFontSize: state.overlay.statsFontSize,
        statsInline: state.overlay.statsInline,
      },
    },
  };

  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `shapegrid-config-${Date.now()}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════════════════════════════
// UI Wiring
// ══════════════════════════════════════════════════════════════════════════════

// Days mode toggle
function setDaysMode(mode: 'last' | 'years' | 'range') {
  updateState('daysMode', mode);
  // Toggle buttons
  document.querySelectorAll('.days-mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(mode === 'last' ? 'dm-last' : mode === 'years' ? 'dm-years' : 'dm-range');
  if (btn) btn.classList.add('active');
  // Toggle panels
  const lastPanel = document.getElementById('dm-last-panel');
  const yearsPanel = document.getElementById('dm-years-panel');
  const rangePanel = document.getElementById('dm-range-panel');
  if (lastPanel) lastPanel.style.display = mode === 'last' ? 'block' : 'none';
  if (yearsPanel) yearsPanel.style.display = mode === 'years' ? 'block' : 'none';
  if (rangePanel) rangePanel.style.display = mode === 'range' ? 'block' : 'none';
}

(document.getElementById('dm-last') as HTMLButtonElement).addEventListener('click', () => setDaysMode('last'));
(document.getElementById('dm-years') as HTMLButtonElement).addEventListener('click', () => setDaysMode('years'));
(document.getElementById('dm-range') as HTMLButtonElement).addEventListener('click', () => setDaysMode('range'));

// Year chips
function buildYearChips() {
  const container = document.getElementById('year-chips');
  if (!container) return;
  container.innerHTML = '';
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 5; y--) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'year-chip' + (state.selectedYears.has(y) ? ' active' : '');
    chip.textContent = String(y);
    chip.addEventListener('click', () => {
      if (state.selectedYears.has(y)) {
        if (state.selectedYears.size > 1) state.selectedYears.delete(y);
      } else {
        state.selectedYears.add(y);
      }
      buildYearChips();
    });
    container.appendChild(chip);
  }
}

function sync(key: string) {
  const el = document.getElementById(`inp-${key}`) as HTMLInputElement;
  if (!el) return;
  const val = el.type === 'range' ? parseFloat(el.value) : el.value;
  updateState(key as any, val);
  updateLabels();
}

function syncToDom(key: string) {
  const el = document.getElementById(`inp-${key}`) as HTMLInputElement;
  if (!el) return;
  el.value = String(state[key as keyof typeof state]);
  updateLabels();
}

function updateLabels() {
  const el = (id: string) => document.getElementById(id);
  el('val-yaw')!.textContent = `${state.yaw}°`;
  el('val-pitch')!.textContent = `${state.pitch}°`;
  el('val-days')!.textContent = String((el('inp-days') as HTMLInputElement).value);
  el('val-gap')!.textContent = state.gap.toFixed(2);
  el('val-height')!.textContent = `${state.heightScale.toFixed(1)}×`;
  el('val-coverage')!.textContent = state.coverage.toFixed(2);
  el('val-coord-axes-scale')!.textContent = state.coordAxesScale.toFixed(1);
  el('val-coord-axes-x-offset')!.textContent = state.coordAxesXOffset.toFixed(2);
  el('val-coord-axes-y-offset')!.textContent = state.coordAxesYOffset.toFixed(2);
  el('val-coord-axes-tick')!.textContent = state.coordAxesTickLength.toFixed(3);
  el('val-coord-axes-label-off')!.textContent = state.coordAxesLabelOffset.toFixed(2);
}

// Sliders — map input IDs to state keys where they differ
['yaw', 'pitch', 'gap', 'coverage'].forEach(key => {
  const el = document.getElementById(`inp-${key}`) as HTMLInputElement;
  if (el) {
    el.addEventListener('input', () => {
      sync(key);
      if (['gap', 'coverage'].includes(key)) {
        computeGrid();
        loadDemo();
      }
      if (['yaw', 'pitch'].includes(key)) posCamera();
      else scheduleRebuild();
    });
  }
});
// Height scale factor slider — state key differs from input ID
const heightEl = document.getElementById('inp-height') as HTMLInputElement;
if (heightEl) {
  heightEl.addEventListener('input', () => {
    state.heightScale = parseFloat(heightEl.value);
    updateLabels();
    scheduleRebuild();
  });
}

// Cell count number input
const countNum = document.getElementById('inp-count-num') as HTMLInputElement;
if (countNum) {
  countNum.addEventListener('change', () => {
    const v = parseInt(countNum.value);
    if (v >= 1 && v <= 9999) {
      updateState('count', v);
      computeGrid();
      // Regenerate data for new grid cells
      if (state.contributions?.username === 'demo') {
        loadDemo();
      }
      // If real contributions exist, resize cellData array to match new grid
      else if (state.contributions && state.contributions.username !== 'demo') {
        const N = state.grid?.cells.length || v;
        const oldData = [...state.cellData];
        updateState('cellData', Array.from({ length: N }, (_, i) => oldData[i] || { date: '', count: 0, intensity: 0 }));
      }
      scheduleRebuild();
    }
  });
}

// Sync cell count to days toggle
const syncCellsCheckbox = document.getElementById('inp-sync-cells') as HTMLInputElement;
if (syncCellsCheckbox) {
  syncCellsCheckbox.addEventListener('change', () => {
    syncDaysToCount();
  });
}

function syncDaysToCount() {
  const sync = (syncCellsCheckbox as HTMLInputElement)?.checked;
  if (!sync) return;
  const daysInput = document.getElementById('inp-days') as HTMLInputElement;
  if (!daysInput) return;
  const days = parseInt(daysInput.value);
  if (days >= 1 && days <= 9999 && countNum) {
    countNum.value = String(days);
    updateState('count', days);
    computeGrid();
    // Only regenerate demo data, don't touch real contributions
    if (state.contributions?.username === 'demo') {
      loadDemo();
    }
    scheduleRebuild();
  }
}

// Also sync when days slider changes
const daysSlider = document.getElementById('inp-days') as HTMLInputElement;
if (daysSlider) {
  daysSlider.addEventListener('input', () => {
    document.getElementById('val-days')!.textContent = daysSlider.value;
    syncDaysToCount();
  });
}

// Sync when days number input changes
const daysNumInput = document.getElementById('inp-days-num') as HTMLInputElement;
if (daysNumInput) {
  daysNumInput.addEventListener('change', () => {
    const v = parseInt(daysNumInput.value);
    if (v >= 1 && v <= 9999 && daysSlider) {
      daysSlider.value = String(v);
      document.getElementById('val-days')!.textContent = String(v);
      syncDaysToCount();
    }
  });
}

// Background color
(document.getElementById('inp-bg-color') as HTMLInputElement).addEventListener('input', e => {
  const target = e.target as HTMLInputElement;
  if (target) {
    (document.getElementById('inp-bg-hex') as HTMLInputElement).value = target.value;
    updateState('background', target.value);
  }
});

(document.getElementById('inp-bg-hex') as HTMLInputElement).addEventListener('change', e => {
    state.background = (e.target as HTMLInputElement).value;
  });

  // ── Post-processing event handlers ──────────────────────────────────
  const syncPP = () => {
    if (bloomNode) {
      bloomNode.strength = state.bloomEnabled ? state.bloomStrength : 0;
      bloomNode.radius = state.bloomRadius;
      bloomNode.threshold = state.bloomThreshold;
    }
    if (state.fogEnabled && !scene.fog) {
      scene.fog = new THREE.FogExp2(state.background, state.fogDensity);
    } else if (state.fogEnabled && scene.fog) {
      (scene.fog as THREE.FogExp2).density = state.fogDensity;
    } else {
      scene.fog = null;
    }
    renderer.toneMapping = state.toneMapping as THREE.ToneMapping;
    renderer.toneMappingExposure = 1.0;
  };

  // Bloom toggle
  (document.getElementById('inp-bloom') as HTMLInputElement).addEventListener('change', e => {
    state.bloomEnabled = (e.target as HTMLInputElement).checked;
    syncPP();
  });
  // Bloom sliders
  ['bloom-strength', 'bloom-radius', 'bloom-threshold'].forEach(id => {
    const el = document.getElementById(`inp-${id}`) as HTMLInputElement;
    if (!el) return;
    const key = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as 'bloomStrength' | 'bloomRadius' | 'bloomThreshold';
    el.addEventListener('input', () => {
      state[key] = parseFloat(el.value);
      syncPP();
    });
  });
  // Fog toggle
  (document.getElementById('inp-fog') as HTMLInputElement).addEventListener('change', e => {
    state.fogEnabled = (e.target as HTMLInputElement).checked;
    syncPP();
  });
  // Fog density
  (document.getElementById('inp-fog-density') as HTMLInputElement).addEventListener('input', e => {
    state.fogDensity = parseFloat((e.target as HTMLInputElement).value);
    syncPP();
  });
  // Env map toggle
  (document.getElementById('inp-env-map') as HTMLInputElement).addEventListener('change', e => {
    state.envMapEnabled = (e.target as HTMLInputElement).checked;
    syncPP();
  });
  // Tone mapping
  (document.getElementById('inp-tone-mapping') as HTMLSelectElement).addEventListener('change', e => {
    state.toneMapping = parseInt((e.target as HTMLSelectElement).value);
    syncPP();
  });

  // Intensity scale mode
  (document.getElementById('inp-scale-mode') as HTMLSelectElement).addEventListener('change', e => {
    state.scaleMode = (e.target as HTMLSelectElement).value as 'linear' | 'sqrt' | 'cbrt' | 'log' | 'quad' | 'inverse';
    scheduleRebuild();
  });

  // ── Language org controls ──────────────────────────────────────────────
  (document.getElementById('inp-include-org') as HTMLInputElement).addEventListener('change', e => {
    state.includeOrgRepos = (e.target as HTMLInputElement).checked;
  });
  (document.getElementById('inp-org-name') as HTMLInputElement).addEventListener('change', e => {
    state.orgName = (e.target as HTMLInputElement).value.trim();
  });

// Grid type
(document.getElementById('inp-grid-type') as HTMLSelectElement).addEventListener('change', e => {
  const target = e.target as HTMLSelectElement;
  updateState('gridType', target.value as any);
  computeGrid();
  loadDemo();
  scheduleRebuild();
});

// Boundary toggle
(document.getElementById('inp-boundary') as HTMLInputElement).addEventListener('change', e => {
  const target = e.target as HTMLInputElement;
  updateState('showBoundary', target.checked);
  scheduleRebuild();
});

// Coord axes toggle
(document.getElementById('inp-coord-axes') as HTMLInputElement).addEventListener('change', e => {
  const target = e.target as HTMLInputElement;
  updateState('showCoordAxes', target.checked);
  scheduleRebuild();
});

// Coord axes settings
['coord-axes-scale', 'coord-axes-x-offset', 'coord-axes-y-offset', 'coord-axes-tick', 'coord-axes-label-off'].forEach(key => {
  const el = document.getElementById(`inp-${key}`) as HTMLInputElement;
  if (el) {
    el.addEventListener('input', () => {
      const stateKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      updateState(stateKey as any, parseFloat(el.value));
      updateLabels();
      scheduleRebuild();
    });
  }
});

(document.getElementById('inp-coord-axes-position') as HTMLSelectElement).addEventListener('change', e => {
  const target = e.target as HTMLSelectElement;
  updateState('coordAxesPosition', target.value as any);
  scheduleRebuild();
});

(document.getElementById('inp-coord-axes-line-color') as HTMLInputElement).addEventListener('input', e => {
  const target = e.target as HTMLInputElement;
  updateState('coordAxesLineColor', target.value);
  scheduleRebuild();
});

(document.getElementById('inp-coord-axes-label-color') as HTMLInputElement).addEventListener('input', e => {
  const target = e.target as HTMLInputElement;
  updateState('coordAxesLabelColor', target.value);
  scheduleRebuild();
});

// Fetch button
(document.getElementById('btn-fetch') as HTMLButtonElement).addEventListener('click', async () => {
  await loadData();
  await fetchAndUpdateLanguages();
});

// Export PNG
(document.getElementById('btn-export') as HTMLButtonElement).addEventListener('click', () => {
  let w = +(document.getElementById('inp-export-w') as HTMLInputElement).value;
  let h = +(document.getElementById('inp-export-h') as HTMLInputElement).value;
  const autocrop = (document.getElementById('inp-export-autocrop') as HTMLInputElement).checked;
  const vertical = (document.getElementById('inp-export-vertical') as HTMLInputElement).checked;
  const padding = +(document.getElementById('inp-export-pad') as HTMLInputElement).value || 40;

  // Swap for vertical/portrait
  if (vertical) { const t = w; w = h; h = t; }

  const offscreen = document.createElement('canvas');
  offscreen.width = w; offscreen.height = h;
  const ctx = offscreen.getContext('2d')!;

  const origW = renderer.domElement.width, origH = renderer.domElement.height;
  const origLeft = camera.left, origRight = camera.right;
  const origTop = camera.top, origBottom = camera.bottom;

  if (autocrop && state.grid && state.grid.cells.length > 0) {
    // Compute bounding box of grid cells in world coords
    const xs = state.grid.cells.map(c => c.cx);
    const ys = state.grid.cells.map(c => c.cy);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const asp = w / h;

    // Add padding proportionally
    const padWorldX = (padding / w) * spanX;
    const padWorldY = (padding / h) * spanY;

    // Center the grid in the view
    const centerX = (minX + maxX) / 2 - 0.5;
    const centerY = (minY + maxY) / 2 - 0.5;

    // Fit with aspect ratio
    let viewW = (spanX + padWorldX * 2) / 2;
    let viewH = (spanY + padWorldY * 2) / 2;
    if (viewW / viewH > asp) viewH = viewW / asp;
    else viewW = viewH * asp;

    camera.left = -viewW;
    camera.right = viewW;
    camera.top = viewH;
    camera.bottom = -viewH;

    // Shift camera to center the grid
    camera.position.x = centerX;
    camera.position.y = 0.5;
    camera.position.z = centerY;
    camera.lookAt(centerX, 0, centerY);

    camera.updateProjectionMatrix();
  } else {
    renderer.setSize(w, h, false);
    posCamera();
  }

  renderer.render(scene, camera);

  // Copy to offscreen canvas
  ctx.fillStyle = state.background;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(renderer.domElement, 0, 0, w, h);

  // Download
  const link = document.createElement('a');
  link.download = `shapegrid-${Date.now()}.png`;
  link.href = offscreen.toDataURL('image/png');
  link.click();

  // Restore
  renderer.setSize(origW, origH, false);
  camera.left = origLeft; camera.right = origRight;
  camera.top = origTop; camera.bottom = origBottom;
  camera.position.x = 0; camera.position.y = 0; camera.position.z = 0;
  camera.updateProjectionMatrix();
  posCamera();
});

// Export Config button
(document.getElementById('btn-export-config') as HTMLButtonElement).addEventListener('click', exportConfig);
// Create Export Config
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    (btn as HTMLButtonElement).classList.add('active');
    const preset = (btn as HTMLButtonElement).dataset.preset!;
    setPreset(preset);
    computeGrid();
    loadDemo();
    scheduleRebuild();
  });
});

// Sidebar tabs
document.querySelectorAll('.sidebar-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    (tab as HTMLButtonElement).classList.add('active');
    const panel = (tab as HTMLButtonElement).dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`[data-panel="${panel}"]`)!.classList.add('active');
  });
});

// Boundary tabs
document.querySelectorAll('.boundary-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.boundary-tab').forEach(t => t.classList.remove('active'));
    (tab as HTMLButtonElement).classList.add('active');
    const panelId = `panel-${(tab as HTMLButtonElement).dataset.tab}`;
    document.querySelectorAll('.boundary-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(panelId)!.classList.add('active');
  });
});

// Country search
const countrySearch = document.getElementById('country-search') as HTMLInputElement;
const countryDropdown = document.getElementById('country-dropdown')!;
const countryGrid = document.getElementById('country-grid')!;

function renderCountryList() {
  countryGrid.innerHTML = '';
  const entries = getCountryList();
  if (entries.length === 0) {
    countryGrid.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:10px">Loading countries...</div>';
    return;
  }
  for (const { code, name } of entries) {
    const btn = document.createElement('button');
    btn.className = 'country-grid-item';
    btn.innerHTML = `<span class="country-name">${name}</span><span class="country-code">${code}</span>`;
    btn.addEventListener('click', () => selectCountry(code));
    countryGrid.appendChild(btn);
  }
}

// Replace the FEATURED_COUNTRIES call with the full list
function renderFeaturedCountries() {
  renderCountryList();
}

function selectCountry(code: string) {
  const country = COUNTRIES[code];
  if (!country) return;
  const coordCs = countryCoordSelect.value as any;
  const normalized = normWithCoordSystem(country.coords, coordCs);
  updateState('poly', normalized);
  updateState('coordSystem', coordCs === 'auto' ? (isLikelyLonLat(country.coords) ? 'wgs84' : 'planar') : coordCs);
  updateState('country', code);
  updateState('preset', '');
  updateState('boundaryType', 'country');
  updateAxesOptionsVisibility();
  computeGrid();
  loadDemo();
  scheduleRebuild();
}

countrySearch.addEventListener('input', () => {
  const q = countrySearch.value.trim();
  if (!q) {
    countryDropdown.innerHTML = '';
    countryDropdown.classList.remove('visible');
    countryGrid.style.display = '';
    renderCountryList();
    return;
  }
  const results = searchCountries(q);
  countryDropdown.innerHTML = '';
  countryGrid.style.display = 'none';
  if (results.length === 0) {
    countryDropdown.innerHTML = '<div class="country-option" style="color:var(--muted);font-style:italic">No matches</div>';
    countryDropdown.classList.add('visible');
    return;
  }
  results.slice(0, 15).forEach(c => {
    const item = document.createElement('div');
    item.className = 'country-option';
    item.innerHTML = `<span>${c.name}</span><span class="country-code">${c.code}</span>`;
    item.addEventListener('click', () => {
      countrySearch.value = c.name;
      countryDropdown.innerHTML = '';
      countryDropdown.classList.remove('visible');
      countryGrid.style.display = '';
      selectCountry(c.code);
    });
    countryDropdown.appendChild(item);
  });
  countryDropdown.classList.add('visible');
});

renderFeaturedCountries();

// File upload
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileUploadArea = document.getElementById('file-upload-area')!;
const fileNameEl = document.getElementById('file-name')!;
const countryCoordSelect = document.getElementById('inp-country-coord-system') as HTMLSelectElement;
const fileCoordSelect = document.getElementById('inp-file-coord-system') as HTMLSelectElement;
const axesOptionsSection = document.getElementById('axes-options-section')!;

fileUploadArea.addEventListener('click', () => fileInput.click());
fileUploadArea.addEventListener('dragover', e => { e.preventDefault(); fileUploadArea.classList.add('dragover'); });
fileUploadArea.addEventListener('dragleave', () => fileUploadArea.classList.remove('dragover'));
fileUploadArea.addEventListener('drop', e => {
  e.preventDefault();
  fileUploadArea.classList.remove('dragover');
  const file = e.dataTransfer?.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) handleFile(fileInput.files[0]);
});

function updateAxesOptionsVisibility() {
  const isGeo = state.coordSystem === 'wgs84' || state.coordSystem === 'mercator';
  const isFileLoaded = state.fileType !== null;
  axesOptionsSection.style.display = (isGeo && isFileLoaded) ? 'block' : 'none';
}

function handleFile(file: File) {
  fileNameEl.textContent = file.name;
  updateState('fileName', file.name);

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'svg') updateState('fileType', 'svg');
  else if (ext === 'geojson' || ext === 'json') updateState('fileType', 'geojson');
  else {
    setStatus('Unsupported file type', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const content = reader.result as string;
    updateState('fileContent', content);
    try {
      let result: { poly: Point2D[]; geoBounds: any; coordSystem: any };
      if (state.fileType === 'svg') {
        updateState('poly', parseSvgFile(content));
        updateAxesOptionsVisibility();
      } else {
        result = parseGeoJsonFile(content, fileCoordSelect.value as any);
        updateState('poly', result.poly);
        updateState('geoBounds', result.geoBounds);
        updateState('coordSystem', result.coordSystem);
        updateAxesOptionsVisibility();
      }
      updateState('boundaryType', 'file');
      computeGrid();
      loadDemo();
      scheduleRebuild();
      setStatus(`✓ Loaded ${file.name}`, 'ok');
    } catch (e: any) {
      setStatus(e.message, 'error');
    }
  };
  reader.readAsText(file);
}

countryCoordSelect.addEventListener('change', () => {
  // For countries
  if (state.boundaryType === 'country' && state.country) {
    selectCountry(state.country);
  }
});

fileCoordSelect.addEventListener('change', () => {
  if (state.fileContent && state.fileType === 'geojson') {
    const result = parseGeoJsonFile(state.fileContent, fileCoordSelect.value as any);
    updateState('poly', result.poly);
    updateState('geoBounds', result.geoBounds);
    updateState('coordSystem', result.coordSystem);
    updateAxesOptionsVisibility();
    computeGrid();
    loadDemo();
    scheduleRebuild();
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Bootstrap
// ══════════════════════════════════════════════════════════════════════════════

async function bootstrap() {
  const overlay = document.getElementById('overlay')!;
  const overlayText = document.getElementById('overlay-text')!;

  try {
    overlayText.textContent = 'Initialising WebGL…';
    
    // Check canvas exists
    if (!canvas) {
      throw new Error('Canvas element #canvas-main not found');
    }
    
    initThree();

    // Set default slider values to match state
    setSliderValue('inp-yaw', state.yaw);
    setSliderValue('inp-pitch', state.pitch);
    setSliderValue('inp-gap', state.gap);
    setSliderValue('inp-height', state.heightScale);
    setSliderValue('inp-coverage', state.coverage);
    setSliderValue('inp-coord-axes-scale', state.coordAxesScale);
    setSliderValue('inp-coord-axes-x-offset', state.coordAxesXOffset);
    setSliderValue('inp-coord-axes-y-offset', state.coordAxesYOffset);
    setSliderValue('inp-coord-axes-tick', state.coordAxesTickLength);
    setSliderValue('inp-coord-axes-label-off', state.coordAxesLabelOffset);

    // Set default select values
    setSelectValue('inp-grid-type', state.gridType);
    setSelectValue('inp-coord-axes-position', state.coordAxesPosition);

    // Set default checkbox values
    setCheckboxValue('inp-boundary', state.showBoundary);
    setCheckboxValue('inp-coord-axes', state.showCoordAxes);

    // Set default background color
    const bgHex = document.getElementById('inp-bg-hex') as HTMLInputElement;
    const bgColor = document.getElementById('inp-bg-color') as HTMLInputElement;
    if (bgHex) bgHex.value = state.background;
    if (bgColor) bgColor.value = state.background;

    // Set default post-processing values
    setCheckboxValue('inp-bloom', state.bloomEnabled);
    setCheckboxValue('inp-fog', state.fogEnabled);
    setCheckboxValue('inp-env-map', state.envMapEnabled);
    setSliderValue('inp-bloom-strength', state.bloomStrength);
    setSliderValue('inp-bloom-radius', state.bloomRadius);
    setSliderValue('inp-bloom-threshold', state.bloomThreshold);
    setSliderValue('inp-fog-density', state.fogDensity);
    setSelectValue('inp-tone-mapping', String(state.toneMapping));
    setSelectValue('inp-scale-mode', state.scaleMode);
    setCheckboxValue('inp-include-org', state.includeOrgRepos);
    const orgInput = document.getElementById('inp-org-name') as HTMLInputElement;
    if (orgInput) orgInput.value = state.orgName;

    // Initialize post-processing on first frame
    setTimeout(() => {
      if (bloomNode) {
        bloomNode.strength = state.bloomEnabled ? state.bloomStrength : 0;
      }
      applyPostProcessing();
    }, 100);

    // Initialize with CI-generated data or fall back to demo
    let dataLoaded = false;
    const loaded = await loadFromUrl('./assets/shapegrid-data.json');
    if (loaded) {
      dataLoaded = true;
      // Loaded from CI-generated data — update palette
      if (state.palette) {
        setActivePalette(state.palette);
        buildLegend();
      }
    } else {
      // Fall back to demo grid
      computeGrid();
      loadDemo();
    }
    scheduleRebuild();

    posCamera();
    updateLabels();

    // Initialize palette UI
    initPaletteUI();

    // Initialize days mode
    setDaysMode(state.daysMode);
    buildYearChips();

    // Initial sync days to count (skip when CI data loaded — would overwrite the grid)
    if (!dataLoaded) {
      syncDaysToCount();
    }

    // Set initial axes options visibility (hidden by default for presets/countries)
    updateAxesOptionsVisibility();

    // Init overlay drag and visibility
    initOverlayDrag();

    // Preload country boundaries
    initCountries().then(() => {
      renderFeaturedCountries();
    });

    // Render dashboard widgets
    renderAllWidgets();

    // ── Editor panel initialisation ────────────────────────────────────────

    // Toolbar — with action callbacks
    initToolbar({
      zoomToFit: () => {
        if (!state.grid || state.grid.cells.length === 0) return;
        const xs = state.grid.cells.map(c => c.cx);
        const ys = state.grid.cells.map(c => c.cy);
        const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
        state.zoom = Math.max(0.3, Math.min(2.5, span * 0.8));
        const asp = canvas.clientWidth / canvas.clientHeight;
        camera.left = -state.zoom * asp / 2; camera.right = state.zoom * asp / 2;
        camera.top = state.zoom / 2; camera.bottom = -state.zoom / 2;
        camera.updateProjectionMatrix();
      },
      resetCamera: () => {
        state.yaw = 30; state.pitch = 45; state.zoom = 1.3;
        syncToDom('yaw'); syncToDom('pitch');
        posCamera();
        scheduleRebuild();
      },
      topDownView: () => {
        state.yaw = 0; state.pitch = 89; state.zoom = 1.3;
        syncToDom('yaw'); syncToDom('pitch');
        posCamera();
        scheduleRebuild();
      },
      screenshot: () => {
        // Reuse export PNG logic
        const w = +(document.getElementById('inp-export-w') as HTMLInputElement).value;
        const h = +(document.getElementById('inp-export-h') as HTMLInputElement).value;
        const offscreen = document.createElement('canvas');
        offscreen.width = w; offscreen.height = h;
        const ctx = offscreen.getContext('2d')!;
        const origW = renderer.domElement.width, origH = renderer.domElement.height;
        renderer.setSize(w, h, false);
        posCamera();
        renderer.render(scene, camera);
        ctx.fillStyle = state.background;
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(canvas, 0, 0, w, h);
        const link = document.createElement('a');
        link.download = `shapegrid-${Date.now()}.png`;
        link.href = offscreen.toDataURL('image/png');
        link.click();
        renderer.setSize(origW, origH, false);
        posCamera();
      },
    });
    syncToolbarState();

    // Measurement overlay
    initMeasureOverlay();

    // Dashboard widget manager
    initWidgetManager();

    // Hide overlay
    setTimeout(() => { overlay.classList.add('hidden'); }, 400);
  } catch (e: any) {
    overlayText.textContent = `Error: ${e.message}`;
    overlayText.style.color = 'var(--danger)';
    console.error('Bootstrap error:', e);
  }
}

function setSliderValue(id: string, value: number) {
  const el = document.getElementById(id) as HTMLInputElement;
  if (el) el.value = String(value);
}

function setSelectValue(id: string, value: string) {
  const el = document.getElementById(id) as HTMLSelectElement;
  if (el) el.value = value;
}

function setCheckboxValue(id: string, value: boolean) {
  const el = document.getElementById(id) as HTMLInputElement;
  if (el) el.checked = value;
}

bootstrap();
