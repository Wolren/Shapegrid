// ══════════════════════════════════════════════════════════════════════════════
// Shapegrid - Main Application Entry Point
// Three.js scene setup, camera controls, and UI wiring
// ══════════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import type { Point2D, ThemeColors } from './src/types';
import { state, updateState, setPreset } from './src/ui/state';
import { norm, normWithCoordSystem, isLikelyLonLat } from './src/geometry/projection';
import { parseGeoJsonFile, parseSvgFile } from './src/geometry/parsers';
import { intensityToColor, colToHex, activePaletteId, setActivePalette, buildLegend } from './src/rendering/colors';
import { loadDemo, computeGrid, loadData, setStatus, loadFromUrl, loadFromJson } from './src/ui/data';
import { createPresets } from './src/data/presets';
import { initPaletteUI } from './src/ui/palette-ui';
import { scheduleRebuild, needsRebuild } from './src/ui/rebuild';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { WebGLPathTracer, DenoiseMaterial } from 'three-gpu-pathtracer';
import html2canvas from 'html2canvas';
import { showExportModal } from './src/ui/export-modal';
import { COUNTRIES, searchCountries, getCountryList, initCountries, getCountryBounds, getContinents } from './src/data/countries';
import { initToolbar, syncToolbarState } from './src/ui/toolbar';
import { initMeasureOverlay, updateMeasureOverlay, handleMeasureClick, clearMeasureOverlay, isMeasuring } from './src/ui/measure';
import { getEditor, setSelectedCells, cancelMeasurement } from './src/ui/editor-state';
import { updateCellInfoWidget } from './src/ui/widget-cell-info';
import { initWidgetManager, listWidgetMeta } from './src/ui/widget-manager';
import { fetchAndUpdateLanguages } from './src/ui/github-langs';
import { renderAllWidgets, getWidgetSetting, setWidgetSetting, DEFAULT_WIDGET_PALETTES, type WidgetPalette } from './src/ui/dashboard';
import { createColorPicker, type ColorPicker } from './src/ui/color-picker';
import './src/ui/widget-legend';
import './src/ui/widget-stats';
import './src/ui/widget-languages';
import './src/ui/widget-cell-info';
import './src/ui/widget-scale';
import './src/ui/widget-coords';
import './src/ui/widget-distribution';
import './src/ui/widget-timeline';
import './src/ui/widget-activity';
import './src/ui/widget-top-cells';
import './src/ui/widget-weekday';
import './src/ui/widget-streak';
import './src/ui/widget-monthly';
import './src/ui/widget-geo';
import './src/ui/widget-minimap';

// ══════════════════════════════════════════════════════════════════════════════
// Three.js Scene
// ══════════════════════════════════════════════════════════════════════════════

const canvas = document.getElementById('canvas-main') as HTMLCanvasElement;
let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.OrthographicCamera;
let dirLight: THREE.DirectionalLight, mesh: THREE.InstancedMesh | null, boundaryLine: THREE.LineLoop | null;
let groundMesh: THREE.Mesh;
let coordAxesGroup: THREE.Group | null;
let composer: EffectComposer | null = null;
// Color-managed background — required for the composer path: the EffectComposer
// renders into a linear HDR target, and a raw clear color (sRGB) would be
// re-encoded by OutputPass, brightening dark backgrounds to grey.
let bgColor: THREE.Color | null = null;
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

  notifyRTViewChanged();
}

function scaleIntensity(raw: number): number {
  const clamped = Math.max(0, Math.min(1, raw));
  switch (state.scaleMode) {
    case 'sqrt': return Math.sqrt(clamped);
    case 'cbrt': return Math.cbrt(clamped);
    case 'log': return clamped <= 0 ? 0 : Math.log(1 + clamped * 9) / Math.log(10);
    default: return clamped;
  }
}

// Fast '#rrggbb' → [0..1] rgb, replacing colToHex() in the per-cell hot loops.
// colToHex allocates a 1×1 canvas + 2D context + getImageData per call
// (~0.05–0.3ms each) — pure waste at thousands of cells, and intensityToColor
// always returns a hex string. Falls back to colToHex for any non-hex color.
const HEX6_RE = /^#([0-9a-f]{6})$/i;
function cssToRgb01(css: string): [number, number, number] {
  const m = HEX6_RE.exec(css);
  if (m) {
    const v = parseInt(m[1], 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }
  return colToHex(css);
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
      default: return clamped;
    }
  };

  // Geometry
  let geo: THREE.BufferGeometry;
  if (gridType === 'square') {
    const s = cellSize * (1 - gap);
    geo = new THREE.BoxGeometry(s, 1, s);
  } else {
    // Hex grid from genHex has center-to-center distance = cs.
    // For touching: r * sqrt(3) = cs  →  r = cs / sqrt(3)
    const r = cellSize / Math.sqrt(3) * (1 - gap);
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
    const [r, g, b] = cssToRgb01(css);
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

// Cache key of the last-built axes — buildMesh calls buildCoordAxes() on every
// rebuild, but the axes only depend on a handful of state fields (not gap,
// height, palette, cellData). Skipping unchanged rebuilds avoids re-creating
// all the tick-line geometries and canvas label textures on every mesh change.
let coordAxesKey = '';

function buildCoordAxes() {
  const isGeo = state.coordSystem === 'wgs84' || state.coordSystem === 'mercator';
  const isFileLoaded = state.fileType !== null;
  const shouldShow = isGeo && !!state.geoBounds && state.showCoordAxes && isFileLoaded && getEditor().layerVisibility.axes;
  const key = JSON.stringify([
    shouldShow,
    state.geoBounds,
    state.coordSystem,
    state.coordAxesLineColor,
    state.coordAxesLabelColor,
    state.coordAxesScale,
    state.coordAxesPosition,
    state.coordAxesXOffset ?? 0.04,
    state.coordAxesYOffset ?? 0.04,
    state.coordAxesTickLength ?? 0.015,
    state.coordAxesLabelOffset ?? 0.03,
  ]);
  if (key === coordAxesKey) return;
  coordAxesKey = key;

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
  // Ray tracing replaces the whole post chain — skip bloom/fog/env management
  if (state.rayTracingEnabled) return;
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

// ══════════════════════════════════════════════════════════════════════════════
// Ray tracing — GPU path tracing via three-gpu-pathtracer
// The instanced grid is converted into a merged, vertex-colored geometry
// (the path tracer does not support InstancedMesh).
// ══════════════════════════════════════════════════════════════════════════════

let pathTracer: any = null;
let rtSceneGroup: THREE.Group | null = null;
let rtReady = false;
let rtPendingReset = false;

// Ray tracing options - read from DOM controls, kept as module lets so the
// path tracer loop can consult them without touching ui/state.ts
let rtDenoise = false;
let rtRenderScale = 1;
// Denoise blit state (three-gpu-pathtracer DenoiseMaterial is the final pass)
let denoiseMat: any = null;
let denoiseQuad: any = null;
let lastBlitSamples = -1;

/**
 * Lazily create the denoise fullscreen pass. DenoiseMaterial (verified from
 * the installed package source) extends MaterialBase, which proxies uniform
 * keys to properties, so `mat.map = texture` sets `uniforms.map.value`.
 * Its fragment shader does glslSmartDeNoise then includes
 * <tonemapping_fragment> and <colorspace_fragment>, so it is designed to be
 * the last pass to the screen. Defaults: sigma 5.0, kSigma 1.0, threshold 0.03.
 */
function ensureDenoiseSetup(): void {
  if (denoiseQuad || !pathTracer) return;
  denoiseMat = new DenoiseMaterial();
  denoiseMat.map = pathTracer.target.texture;
  denoiseQuad = new FullScreenQuad(denoiseMat);
}

/** Blit the accumulated RT target through the denoise material to the canvas. */
function denoiseBlit(): void {
  if (!denoiseMat || !denoiseQuad || !pathTracer) return;
  denoiseMat.map = pathTracer.target.texture;
  renderer.setRenderTarget(null);
  renderer.autoClear = false;
  denoiseQuad.render(renderer);
  renderer.autoClear = true;
}

function isRTAvailable(): boolean {
  return rtReady && !!pathTracer;
}

function initRayTracing(): boolean {
  if (pathTracer) return rtReady;
  if (!renderer.capabilities.isWebGL2) {
    rtReady = false;
    return false;
  }
  try {
    pathTracer = new WebGLPathTracer(renderer);
    pathTracer.tiles.set(3, 3);
    pathTracer.dynamicLowRes = true;
    pathTracer.lowResScale = 0.15;
    pathTracer.fadeDuration = 250;
    pathTracer.minSamples = 3;
    pathTracer.bounces = state.rayTracingBounces;
    pathTracer.renderScale = rtRenderScale;
    rtReady = true;
  } catch (e) {
    console.warn('[rt] path tracer init failed:', e);
    rtReady = false;
    pathTracer = null;
  }
  return rtReady;
}

/** Build the merged vertex-colored grid geometry for path tracing. */
function buildRTGridGeometry(): THREE.BufferGeometry {
  const grid = state.grid;
  const geo = new THREE.BufferGeometry();
  if (!grid || grid.cells.length === 0) return geo;

  const { cells, cellSize, gridType } = grid;
  const unit = gridType === 'square'
    ? new THREE.BoxGeometry(1, 1, 1)
    : new THREE.CylinderGeometry(1, 1, 1, 6);
  const posAttr = unit.attributes.position as THREE.BufferAttribute;
  const norAttr = unit.attributes.normal as THREE.BufferAttribute;
  const idxAttr = unit.index as THREE.BufferAttribute;
  const unitVerts = posAttr.count;

  const sx = gridType === 'square'
    ? cellSize * (1 - state.gap)
    : cellSize / Math.sqrt(3) * (1 - state.gap);

  const positions: number[] = [];
  const normals: number[] = [];
  const colorsArr: number[] = [];
  const indices: number[] = [];

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const t = new THREE.Vector3();
  const col = new THREE.Color();
  let base = 0;

  const scaleIntensityRT = (raw: number): number => {
    const clamped = Math.max(0, Math.min(1, raw));
    switch (state.scaleMode) {
      case 'sqrt': return Math.sqrt(clamped);
      case 'cbrt': return Math.cbrt(clamped);
      case 'log': return clamped <= 0 ? 0 : Math.log(1 + clamped * 9) / Math.log(10);
      default: return clamped;
    }
  };

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const d = state.cellData[i] || { intensity: 0, count: 0 };
    const scaled = scaleIntensityRT(d.intensity);
    const h = Math.max(0.008, scaled * state.heightScale * 0.12 + 0.008);

    t.set(cell.cx - 0.5, h / 2, cell.cy - 0.5);
    s.set(sx, h, sx);
    m.compose(t, q, s);

    const css = intensityToColor(scaled, activePaletteId);
    const [r, g, b] = cssToRgb01(css);
    col.setRGB(r, g, b);

    for (let j = 0; j < unitVerts; j++) {
      v.fromBufferAttribute(posAttr, j).applyMatrix4(m);
      positions.push(v.x, v.y, v.z);
      n.fromBufferAttribute(norAttr, j);
      normals.push(n.x, n.y, n.z);
      colorsArr.push(col.r, col.g, col.b);
    }
    for (let j = 0; j < idxAttr.count; j++) {
      indices.push(idxAttr.getX(j) + base);
    }
    base += unitVerts;
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colorsArr, 3));
  geo.setIndex(indices);
  unit.dispose();
  return geo;
}

function ensureRTEnvironment(): void {
  if (scene.environment) return;
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTexture.texture;
  pmremGenerator.dispose();
}

function disposeRTScene(): void {
  if (rtSceneGroup) {
    scene.remove(rtSceneGroup);
    rtSceneGroup.traverse(obj => {
      const meshObj = obj as THREE.Mesh;
      if (meshObj.geometry) meshObj.geometry.dispose();
      if (meshObj.material) (meshObj.material as THREE.Material).dispose();
    });
    rtSceneGroup = null;
  }
  // Restore the normal scene objects
  if (mesh) mesh.visible = true;
  if (boundaryLine) boundaryLine.visible = true;
  if (coordAxesGroup) coordAxesGroup.visible = true;
  groundMesh.visible = true;
}

function rebuildRTScene(): void {
  if (!isRTAvailable()) return;
  disposeRTScene();

  const group = new THREE.Group();

  const gridGeo = buildRTGridGeometry();
  const gridMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.0,
  });
  group.add(new THREE.Mesh(gridGeo, gridMat));

  // Ground plane — path tracer needs a real surface material (no ShadowMaterial)
  const gGeo = new THREE.PlaneGeometry(6, 6);
  const gMat = new THREE.MeshStandardMaterial({ color: 0x1b2129, roughness: 1.0, metalness: 0.0 });
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.002;
  group.add(ground);

  rtSceneGroup = group;
  scene.add(group);

  // Hide WebGL-only scene chrome
  if (mesh) mesh.visible = false;
  if (boundaryLine) boundaryLine.visible = false;
  if (coordAxesGroup) coordAxesGroup.visible = false;
  groundMesh.visible = false;

  ensureRTEnvironment();
  pathTracer.setScene(scene, camera);
  rtPendingReset = false;
}

/** Restart RT accumulation after any view change. */
function notifyRTViewChanged(): void {
  if (!isRTAvailable() || !state.rayTracingEnabled) return;
  pathTracer.updateCamera();
  rtPendingReset = true;
}

/** Block until the path tracer has accumulated the quality target (async). */
async function ensureRTSamples(): Promise<void> {
  if (!isRTAvailable() || !state.rayTracingEnabled) return;
  const target = Math.min(state.rayTracingSamples, 256);
  const statusEl = document.getElementById('rt-status');
  while (pathTracer.samples < target) {
    pathTracer.renderSample();
    if (statusEl) statusEl.textContent = `· ${pathTracer.samples}/${target}`;
    await new Promise(r => requestAnimationFrame(r));
  }
  // Denoise the final accumulated frame before capture
  if (rtDenoise) {
    ensureDenoiseSetup();
    denoiseBlit();
    lastBlitSamples = pathTracer.samples;
  }
  if (statusEl) statusEl.textContent = '';
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
    if (isRTAvailable() && state.rayTracingEnabled) {
      rebuildRTScene();
    } else {
      buildMesh();
    }
  }
  applyPostProcessing();
  // Color-managed scene background (works identically in the direct and
  // composer paths — three.js converts it to the render target's color space)
  if (!bgColor) bgColor = new THREE.Color();
  if (!scene.background) scene.background = bgColor;
  if (bgColor.getStyle() !== state.background) bgColor.set(state.background);
  // Keep the clear color in sync too (used for the underlying RT clear)
  renderer.setClearColor(state.background, 1);

  // Ray tracing path — accumulate samples to the quality target
  if (isRTAvailable() && state.rayTracingEnabled && pathTracer) {
    if (rtPendingReset) {
      pathTracer.reset();
      rtPendingReset = false;
      lastBlitSamples = -1;
    }
    if (pathTracer.samples < state.rayTracingSamples) {
      pathTracer.renderSample();
    }
    // Once accumulation reaches the target, run the denoise final pass
    // (re-blit only when the sample count changed since the last blit)
    if (rtDenoise && pathTracer.samples >= state.rayTracingSamples && pathTracer.samples !== lastBlitSamples) {
      ensureDenoiseSetup();
      denoiseBlit();
      lastBlitSamples = pathTracer.samples;
    }
    return;
  }

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
  updateState('yaw', parseFloat(((((state.yaw + dx * .4) % 360) + 540) % 360 - 180).toFixed(1)));
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
  notifyRTViewChanged();
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
        tooltip.replaceChildren();
        if (d.date) {
          const strong = document.createElement('strong');
          strong.textContent = d.date;
          tooltip.appendChild(strong);
          tooltip.appendChild(document.createElement('br'));
          tooltip.appendChild(document.createTextNode(`${d.count} contribution${d.count !== 1 ? 's' : ''}`));
        } else {
          const span = document.createElement('span');
          span.style.color = 'var(--muted)';
          span.textContent = 'No data';
          tooltip.appendChild(span);
        }
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
      theme: { palette: state.palette, colors: state.theme },
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
  el('val-bloom-strength')!.textContent = state.bloomStrength.toFixed(2);
  el('val-bloom-radius')!.textContent = state.bloomRadius.toFixed(2);
  el('val-bloom-threshold')!.textContent = state.bloomThreshold.toFixed(2);
  el('val-fog-density')!.textContent = state.fogDensity.toFixed(2);
  el('val-rt-bounces')!.textContent = String(state.rayTracingBounces);
}

// Sliders — map input IDs to state keys where they differ
['yaw', 'pitch', 'gap', 'coverage'].forEach(key => {
  const el = document.getElementById(`inp-${key}`) as HTMLInputElement;
  if (el) {
    el.addEventListener('input', () => {
      sync(key);
      if (key === 'coverage') {
        // Coverage threshold changes which cells survive generation — regen.
        computeGrid();
        loadDemo();
      }
      // 'gap' only affects mesh geometry (buildMesh); the cell layout is
      // gap-independent, so a full grid regen per input event is pure waste.
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
// Cap the "Last N days" slider at the day GitHub itself was created
// (2007-10-19, the first commit), so the whole history is reachable.
// Computed dynamically so the cap grows with time.
const GITHUB_EPOCH_MS = Date.UTC(2007, 9, 19);
if (daysSlider) {
  daysSlider.max = String(Math.max(365, Math.ceil((Date.now() - GITHUB_EPOCH_MS) / 86400000)));
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
  const v = (e.target as HTMLInputElement).value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
  updateState('background', v);
  const picker = document.getElementById('inp-bg-color') as HTMLInputElement;
  if (picker) picker.value = v;
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
      updateLabels();
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
    updateLabels();
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

  // ── Ray tracing controls ──────────────────────────────────────────────
  (document.getElementById('inp-ray-tracing') as HTMLInputElement).addEventListener('change', e => {
    const enabled = (e.target as HTMLInputElement).checked;
    const statusEl = document.getElementById('rt-status');
    if (enabled) {
      const ok = initRayTracing();
      if (!ok) {
        (e.target as HTMLInputElement).checked = false;
        state.rayTracingEnabled = false;
        if (statusEl) statusEl.textContent = '· unavailable (WebGL2 required)';
        return;
      }
      state.rayTracingEnabled = true;
      rebuildRTScene();
      if (statusEl) statusEl.textContent = '';
    } else {
      state.rayTracingEnabled = false;
      disposeRTScene();
    }
  });
  (document.getElementById('inp-rt-samples') as HTMLSelectElement).addEventListener('change', e => {
    state.rayTracingSamples = parseInt((e.target as HTMLSelectElement).value);
    if (isRTAvailable() && state.rayTracingEnabled) {
      pathTracer.reset();
      rtPendingReset = false;
      lastBlitSamples = -1;
    }
  });
  (document.getElementById('inp-rt-bounces') as HTMLInputElement).addEventListener('input', e => {
    state.rayTracingBounces = parseInt((e.target as HTMLInputElement).value);
    if (isRTAvailable() && state.rayTracingEnabled) {
      pathTracer.bounces = state.rayTracingBounces;
      pathTracer.reset();
      rtPendingReset = false;
      lastBlitSamples = -1;
    }
    updateLabels();
  });
  // Denoise toggle - when enabled after the target is already accumulated,
  // blit immediately so the canvas switches to the denoised image
  (document.getElementById('inp-rt-denoise') as HTMLInputElement).addEventListener('change', e => {
    rtDenoise = (e.target as HTMLInputElement).checked;
    if (rtDenoise && isRTAvailable() && state.rayTracingEnabled && pathTracer.samples >= state.rayTracingSamples) {
      ensureDenoiseSetup();
      denoiseBlit();
    }
    lastBlitSamples = -1;
  });
  // Render scale - restart accumulation at the new internal resolution
  (document.getElementById('inp-rt-scale') as HTMLSelectElement).addEventListener('change', e => {
    rtRenderScale = parseFloat((e.target as HTMLSelectElement).value);
    if (isRTAvailable() && state.rayTracingEnabled) {
      pathTracer.renderScale = rtRenderScale;
      pathTracer.reset();
      rtPendingReset = false;
      lastBlitSamples = -1;
    }
  });

  // Intensity scale mode
  (document.getElementById('inp-scale-mode') as HTMLSelectElement).addEventListener('change', e => {
    state.scaleMode = (e.target as HTMLSelectElement).value as 'linear' | 'sqrt' | 'cbrt' | 'log';
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

// Export PNG — capture the FINAL render: 3D view + dashboard widgets, with
// all editor chrome stripped, matching the CI-rendered output.

async function captureFinalRender(): Promise<{ canvas: HTMLCanvasElement; w: number; h: number; format: string; scale: number } | null> {
  let w = +(document.getElementById('inp-export-w') as HTMLInputElement).value;
  let h = +(document.getElementById('inp-export-h') as HTMLInputElement).value;
  const autocrop = (document.getElementById('inp-export-autocrop') as HTMLInputElement).checked;
  const vertical = (document.getElementById('inp-export-vertical') as HTMLInputElement).checked;
  const padding = +(document.getElementById('inp-export-pad') as HTMLInputElement).value || 40;
  const exportTitle = ((document.getElementById('inp-export-title') as HTMLInputElement)?.value || '').trim();
  const exportFormat = ((document.getElementById('inp-export-format') as HTMLSelectElement)?.value || 'png');
  const exportScale = parseFloat((document.getElementById('inp-export-scale') as HTMLSelectElement)?.value) || 1;

  // Apply scale multiplier BEFORE the camera/autocrop math (1200x600 @2x → 2400x1200)
  w = Math.round(w * exportScale);
  h = Math.round(h * exportScale);

  // Swap for vertical/portrait
  if (vertical) { const t = w; w = h; h = t; }

  const wrap = document.getElementById('canvas-wrap')!;
  const wrapRect = wrap.getBoundingClientRect();
  if (wrapRect.width < 10 || wrapRect.height < 10) return null;

  const origW = renderer.domElement.width, origH = renderer.domElement.height;
  const origLeft = camera.left, origRight = camera.right;
  const origTop = camera.top, origBottom = camera.bottom;

  // Strip editor chrome (toolbar, tooltip, measure overlay, widget close buttons)
  document.body.classList.add('export-mode');

  try {
    if (autocrop && state.grid && state.grid.cells.length > 0) {
      // Grid world-space AABB. Cells are centered at (cx - 0.5, cy - 0.5)
      // and raised to h in Y (same math as buildMesh).
      const xs = state.grid.cells.map(c => c.cx - 0.5);
      const zs = state.grid.cells.map(c => c.cy - 0.5);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minZ = Math.min(...zs), maxZ = Math.max(...zs);
      let maxY = 0.008;
      state.grid.cells.forEach((_cell, i) => {
        const d = state.cellData[i] || { intensity: 0, count: 0 };
        const h = Math.max(0.008, scaleIntensity(d.intensity) * state.heightScale * 0.12 + 0.008);
        if (h > maxY) maxY = h;
      });
      const center = new THREE.Vector3((minX + maxX) / 2, maxY / 2, (minZ + maxZ) / 2);

      // Keep the current orbit orientation (yaw/pitch); only the fit changes.
      const yaw = (state.yaw * Math.PI) / 180;
      const pitch = (state.pitch * Math.PI) / 180;
      const dir = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch)
      );
      camera.position.copy(center).addScaledVector(dir, 2.5);
      camera.up.set(0, 1, 0);
      camera.lookAt(center);
      camera.updateMatrixWorld();

      // Project the AABB corners onto the camera right/up axes.
      const f = new THREE.Vector3();
      camera.getWorldDirection(f);
      let right = new THREE.Vector3().crossVectors(f, camera.up);
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0); // pitch ~90° guard
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, f);

      let halfW = 0, halfH = 0;
      for (const cx of [minX, maxX]) {
        for (const cy of [0, maxY]) {
          for (const cz of [minZ, maxZ]) {
            const d = new THREE.Vector3(cx - center.x, cy - center.y, cz - center.z);
            halfW = Math.max(halfW, Math.abs(d.dot(right)));
            halfH = Math.max(halfH, Math.abs(d.dot(up)));
          }
        }
      }

      const asp = w / h;
      const padW = (padding / w) * (halfW * 2);
      const padH = (padding / h) * (halfH * 2);
      let viewW = halfW + padW, viewH = halfH + padH;
      if (viewW / viewH > asp) viewH = viewW / asp;
      else viewW = viewH * asp;

      camera.left = -viewW; camera.right = viewW;
      camera.top = viewH; camera.bottom = -viewH;
      camera.updateProjectionMatrix();
      notifyRTViewChanged();
    } else {
      renderer.setSize(w, h, false);
      posCamera();
    }

    // Ray tracing: accumulate to the quality target before capturing
    if (isRTAvailable() && state.rayTracingEnabled) {
      await ensureRTSamples();
    } else {
      const effectsActive = (composer !== null) && (state.bloomEnabled || state.toneMapping !== 0 || state.fogEnabled || state.envMapEnabled);
      if (effectsActive) {
        composer!.render();
      } else {
        renderer.render(scene, camera);
      }
    }

    // ── Composite: background → 3D view → widgets ───────────────────────
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = state.background;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(renderer.domElement, 0, 0, w, h);

    // Widgets: capture each widget DOM subtree and draw it at its position
    const widgets = wrap.querySelectorAll<HTMLElement>('.dashboard-widget');
    const widgetScale = Math.min(Math.max(w / wrapRect.width, 0.5), 3);
    for (const el of widgets) {
      const r = el.getBoundingClientRect();
      // Skip widgets outside the visible wrap area
      if (r.bottom < wrapRect.top || r.top > wrapRect.bottom) continue;
      if (r.width < 4 || r.height < 4) continue;

      const dx = ((r.left - wrapRect.left) / wrapRect.width) * w;
      const dy = ((r.top - wrapRect.top) / wrapRect.height) * h;
      const dw = (r.width / wrapRect.width) * w;
      const dh = (r.height / wrapRect.height) * h;

      try {
        const widgetCanvas = await html2canvas(el, {
          backgroundColor: null,
          scale: widgetScale,
          logging: false,
          useCORS: true,
        });
        ctx.drawImage(widgetCanvas, dx, dy, dw, dh);
      } catch (e) {
        console.warn('[export] widget capture failed:', e);
      }
    }

    // Optional title text — drawn on top of the composite, scaled with the render
    if (exportTitle) {
      const titleText = exportTitle.length > 60 ? exportTitle.slice(0, 60) + '…' : exportTitle;
      ctx.font = `600 ${Math.round(44 * w / 1200)}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(titleText, w / 2 + 3, 56 * w / 1200 + 3);
      ctx.fillStyle = '#e6edf3';
      ctx.fillText(titleText, w / 2, 56 * w / 1200);
    }

    return { canvas: out, w, h, format: exportFormat, scale: exportScale };
  } finally {
    // Restore
    document.body.classList.remove('export-mode');
    renderer.setSize(origW, origH, false);
    camera.left = origLeft; camera.right = origRight;
    camera.top = origTop; camera.bottom = origBottom;
    camera.position.x = 0; camera.position.y = 0; camera.position.z = 0;
    camera.updateProjectionMatrix();
    posCamera();
  }
}

function downloadCanvas(canvas: HTMLCanvasElement, format: string = 'png'): void {
  const link = document.createElement('a');
  const ext = format === 'jpg' ? 'jpg' : format === 'webp' ? 'webp' : 'png';
  link.download = `shapegrid-${Date.now()}.${ext}`;
  if (format === 'jpg') link.href = canvas.toDataURL('image/jpeg', 0.92);
  else if (format === 'webp') link.href = canvas.toDataURL('image/webp', 0.92);
  else link.href = canvas.toDataURL('image/png');
  link.click();
}

/** Run the final-render capture and show the preview modal. */
async function showExportPreview(): Promise<void> {
  const result = await captureFinalRender();
  if (!result) return;
  const format = result.format;
  showExportModal(result.canvas, result.w, result.h, () => {
    downloadCanvas(result.canvas, format);
  });
}

// Export Config button
(document.getElementById('btn-export-config') as HTMLButtonElement).addEventListener('click', exportConfig);

// ── Theme colors ─────────────────────────────────────────────────────────────

const THEME_KEYS: { key: keyof ThemeColors; id: string }[] = [
  { key: 'accent', id: 'inp-theme-accent' },
  { key: 'accent2', id: 'inp-theme-accent2' },
  { key: 'background', id: 'inp-theme-background' },
  { key: 'surface', id: 'inp-theme-surface' },
  { key: 'surface2', id: 'inp-theme-surface2' },
  { key: 'surface3', id: 'inp-theme-surface3' },
  { key: 'border', id: 'inp-theme-border' },
  { key: 'text', id: 'inp-theme-text' },
  { key: 'muted', id: 'inp-theme-muted' },
];

const THEME_VAR_MAP: Record<keyof ThemeColors, string> = {
  accent: '--accent',
  accent2: '--accent2',
  background: '--bg',
  surface: '--surface',
  surface2: '--surface2',
  surface3: '--surface3',
  border: '--border',
  text: '--text',
  muted: '--muted',
};

const DEFAULT_THEME: ThemeColors = {
  accent: '#39d353',
  accent2: '#1f6feb',
  background: '#080c10',
  surface: '#0d1117',
  surface2: '#161b22',
  surface3: '#21262d',
  border: '#30363d',
  text: '#e6edf3',
  muted: '#8b949e',
};

// One-click theme presets for the Editor Colors section. Every theme defines
// the full 9-color set: accent, accent2, background, surface, surface2,
// surface3, border, text, muted.
const THEME_PRESETS: { name: string; theme: ThemeColors }[] = [
  { name: 'GitHub', theme: DEFAULT_THEME },
  {
    name: 'Forest',
    theme: {
      accent: '#58d68d', accent2: '#2e86c1',
      background: '#0a0f0d', surface: '#0f1613', surface2: '#182420', surface3: '#24362e',
      border: '#2f4a3e', text: '#e8f5e9', muted: '#8fae9e',
    },
  },
  {
    name: 'Ocean',
    theme: {
      accent: '#38bdf8', accent2: '#6366f1',
      background: '#060b13', surface: '#0b1220', surface2: '#131c2e', surface3: '#1e2a40',
      border: '#2b3a56', text: '#e2e8f0', muted: '#7f8ea3',
    },
  },
  {
    name: 'Sunset',
    theme: {
      accent: '#fb923c', accent2: '#e879f9',
      background: '#120a08', surface: '#1a0f0b', surface2: '#2a1710', surface3: '#3d2318',
      border: '#52301f', text: '#fdeee3', muted: '#c2a394',
    },
  },
  {
    name: 'Mono',
    theme: {
      accent: '#c9d1d9', accent2: '#8b949e',
      background: '#0a0a0a', surface: '#101010', surface2: '#181818', surface3: '#242424',
      border: '#333333', text: '#f0f0f0', muted: '#9a9a9a',
    },
  },
  {
    name: 'Midnight',
    theme: {
      accent: '#a78bfa', accent2: '#818cf8',
      background: '#07070f', surface: '#0d0d1a', surface2: '#151528', surface3: '#1f1f38',
      border: '#2e2e4d', text: '#e5e7ff', muted: '#8d8db3',
    },
  },
  {
    name: 'Aurora',
    theme: {
      accent: '#2dd4bf', accent2: '#34d399',
      background: '#04100d', surface: '#071713', surface2: '#0d241e', surface3: '#17352c',
      border: '#23503f', text: '#dcfce7', muted: '#7fb8a5',
    },
  },
  {
    name: 'Cherry',
    theme: {
      accent: '#f87171', accent2: '#fb7185',
      background: '#120606', surface: '#1c0a0a', surface2: '#2b1111', surface3: '#3f1a1a',
      border: '#5c2626', text: '#ffe4e4', muted: '#c98f8f',
    },
  },
  {
    name: 'Amber',
    theme: {
      accent: '#fbbf24', accent2: '#f59e0b',
      background: '#120b02', surface: '#1a1206', surface2: '#271b0a', surface3: '#392813',
      border: '#53391a', text: '#fef3c7', muted: '#c9a76b',
    },
  },
  {
    name: 'Cyber',
    theme: {
      accent: '#22d3ee', accent2: '#e879f9',
      background: '#04040d', surface: '#0a0a18', surface2: '#111129', surface3: '#1c1c3d',
      border: '#2c2c55', text: '#d9f4ff', muted: '#8fa3c9',
    },
  },
  {
    name: 'Slate',
    theme: {
      accent: '#60a5fa', accent2: '#94a3b8',
      background: '#0a0e14', surface: '#0f141c', surface2: '#161d28', surface3: '#202936',
      border: '#2d3947', text: '#e2e8f0', muted: '#7c8aa0',
    },
  },
  {
    name: 'Ember',
    theme: {
      accent: '#ff6b35', accent2: '#ffb703',
      background: '#150a04', surface: '#1f0f06', surface2: '#2e1608', surface3: '#42200b',
      border: '#5c2e10', text: '#ffe8d6', muted: '#c9a184',
    },
  },
];

// Widget themes: one coherent palette (accent + secondary) per widget,
// applied across the whole Widget Colors section. 'Default' clears all
// widget overrides so every widget uses its built-in default palette.
const WIDGET_THEMES: { name: string; palettes: Record<string, WidgetPalette> }[] = [
  { name: 'Default', palettes: {} },
  {
    name: 'Neon',
    palettes: {
      legend:       { accent: '#39d353', secondary: '#2ea043' },
      stats:        { accent: '#58a6ff', secondary: '#388bfd' },
      languages:    { accent: '#d29922', secondary: '#9e6a03' },
      cellInfo:     { accent: '#f778ba', secondary: '#db61a2' },
      scaleBar:     { accent: '#39d353', secondary: '#2ea043' },
      coordinates:  { accent: '#7d8590', secondary: '#6e7681' },
      distribution: { accent: '#f78166', secondary: '#e34d2f' },
      timeline:     { accent: '#58a6ff', secondary: '#388bfd' },
      activity:     { accent: '#a371f7', secondary: '#8957e5' },
      topCells:     { accent: '#f778ba', secondary: '#db61a2' },
      weekday:      { accent: '#39d353', secondary: '#2ea043' },
      streak:       { accent: '#f78166', secondary: '#e34d2f' },
      monthly:      { accent: '#58a6ff', secondary: '#388bfd' },
      geo:          { accent: '#a371f7', secondary: '#8957e5' },
      minimap:      { accent: '#39d353', secondary: '#2ea043' },
    },
  },
  {
    name: 'Cool',
    palettes: {
      legend:       { accent: '#2dd4bf', secondary: '#0f766e' },
      stats:        { accent: '#38bdf8', secondary: '#0284c7' },
      languages:    { accent: '#34d399', secondary: '#059669' },
      cellInfo:     { accent: '#60a5fa', secondary: '#2563eb' },
      scaleBar:     { accent: '#2dd4bf', secondary: '#0f766e' },
      coordinates:  { accent: '#94a3b8', secondary: '#64748b' },
      distribution: { accent: '#22d3ee', secondary: '#0891b2' },
      timeline:     { accent: '#38bdf8', secondary: '#0284c7' },
      activity:     { accent: '#6366f1', secondary: '#4f46e5' },
      topCells:     { accent: '#60a5fa', secondary: '#2563eb' },
      weekday:      { accent: '#34d399', secondary: '#059669' },
      streak:       { accent: '#2dd4bf', secondary: '#0f766e' },
      monthly:      { accent: '#38bdf8', secondary: '#0284c7' },
      geo:          { accent: '#6366f1', secondary: '#4f46e5' },
      minimap:      { accent: '#2dd4bf', secondary: '#0f766e' },
    },
  },
  {
    name: 'Warm',
    palettes: {
      legend:       { accent: '#fbbf24', secondary: '#b45309' },
      stats:        { accent: '#fb923c', secondary: '#c2410c' },
      languages:    { accent: '#f59e0b', secondary: '#b45309' },
      cellInfo:     { accent: '#f472b6', secondary: '#be185d' },
      scaleBar:     { accent: '#fbbf24', secondary: '#b45309' },
      coordinates:  { accent: '#a8a29e', secondary: '#78716c' },
      distribution: { accent: '#f87171', secondary: '#b91c1c' },
      timeline:     { accent: '#fb923c', secondary: '#c2410c' },
      activity:     { accent: '#f59e0b', secondary: '#b45309' },
      topCells:     { accent: '#f472b6', secondary: '#be185d' },
      weekday:      { accent: '#fbbf24', secondary: '#b45309' },
      streak:       { accent: '#f87171', secondary: '#b91c1c' },
      monthly:      { accent: '#fb923c', secondary: '#c2410c' },
      geo:          { accent: '#f59e0b', secondary: '#b45309' },
      minimap:      { accent: '#fbbf24', secondary: '#b45309' },
    },
  },
  {
    name: 'Pastel',
    palettes: {
      legend:       { accent: '#86efac', secondary: '#4ade80' },
      stats:        { accent: '#93c5fd', secondary: '#60a5fa' },
      languages:    { accent: '#fcd34d', secondary: '#fbbf24' },
      cellInfo:     { accent: '#f9a8d4', secondary: '#f472b6' },
      scaleBar:     { accent: '#86efac', secondary: '#4ade80' },
      coordinates:  { accent: '#cbd5e1', secondary: '#94a3b8' },
      distribution: { accent: '#fdba74', secondary: '#fb923c' },
      timeline:     { accent: '#93c5fd', secondary: '#60a5fa' },
      activity:     { accent: '#c4b5fd', secondary: '#a78bfa' },
      topCells:     { accent: '#f9a8d4', secondary: '#f472b6' },
      weekday:      { accent: '#86efac', secondary: '#4ade80' },
      streak:       { accent: '#fdba74', secondary: '#fb923c' },
      monthly:      { accent: '#93c5fd', secondary: '#60a5fa' },
      geo:          { accent: '#c4b5fd', secondary: '#a78bfa' },
      minimap:      { accent: '#86efac', secondary: '#4ade80' },
    },
  },
];

/**
 * Widget Colors section (Theme tab): widget theme bar + accent/secondary
 * pickers per widget, fully independent from the editor theme.
 */
interface WidgetPickerSet {
  accent: ColorPicker;
  secondary: ColorPicker;
}

const widgetColorPickers: Record<string, WidgetPickerSet> = {};

function initThemeWidgetColors(): void {
  const host = document.getElementById('theme-widget-colors');
  if (!host) return;

  // Widget theme selector bar
  const bar = document.createElement('div');
  bar.className = 'widget-theme-bar';
  for (const wt of WIDGET_THEMES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'widget-theme-btn';
    btn.textContent = wt.name;
    btn.title = `Apply the ${wt.name} widget palette`;
    btn.addEventListener('click', () => {
      for (const { id } of listWidgetMeta()) {
        const pal = wt.palettes[id];
        setWidgetSetting(id, 'accent', pal?.accent ?? '');
        setWidgetSetting(id, 'secondary', pal?.secondary ?? '');
        widgetColorPickers[id]?.accent.setValue(pal?.accent ?? DEFAULT_WIDGET_PALETTES[id].accent);
        widgetColorPickers[id]?.secondary.setValue(pal?.secondary ?? DEFAULT_WIDGET_PALETTES[id].secondary);
      }
      renderAllWidgets();
    });
    bar.appendChild(btn);
  }
  host.appendChild(bar);

  // Per-widget accent + secondary rows
  for (const { id, title } of listWidgetMeta()) {
    const row = document.createElement('div');
    row.className = 'theme-row widget-color-row';

    const label = document.createElement('label');
    label.textContent = title;
    label.title = title;
    row.appendChild(label);

    const makePicker = (key: 'accent' | 'secondary'): ColorPicker => {
      const get = (): string =>
        (getWidgetSetting(id, key, '') as string) || DEFAULT_WIDGET_PALETTES[id][key];
      const picker = createColorPicker({
        value: get(),
        onChange: (hex) => {
          setWidgetSetting(id, key, hex.toLowerCase());
          renderAllWidgets();
        },
        onCommit: (hex) => {
          setWidgetSetting(id, key, hex.toLowerCase());
          renderAllWidgets();
        },
        resetLabel: 'theme',
        onReset: () => {
          setWidgetSetting(id, key, '');
          picker.setValue(DEFAULT_WIDGET_PALETTES[id][key]);
          renderAllWidgets();
        },
      }, row);
      return picker;
    };

    widgetColorPickers[id] = {
      accent: makePicker('accent'),
      secondary: makePicker('secondary'),
    };

    host.appendChild(row);
  }
}

const themeCards: Record<string, HTMLElement> = {};

function setActiveThemeCard(name: string): void {
  for (const [n, el] of Object.entries(themeCards)) {
    el.classList.toggle('active', n === name);
  }
}

function initThemePresets(): void {
  const host = document.getElementById('theme-presets');
  if (!host) return;
  for (const preset of THEME_PRESETS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'theme-card';
    card.title = `Apply the ${preset.name} theme`;

    const name = document.createElement('div');
    name.className = 'theme-card-name';
    name.textContent = preset.name;

    const strip = document.createElement('div');
    strip.className = 'theme-card-strip';
    const preview = [
      preset.theme.accent, preset.theme.accent2, preset.theme.background,
      preset.theme.surface2, preset.theme.surface3, preset.theme.border, preset.theme.text,
    ];
    for (const color of preview) {
      const chip = document.createElement('span');
      chip.className = 'theme-card-chip';
      chip.style.background = color;
      strip.appendChild(chip);
    }

    card.appendChild(name);
    card.appendChild(strip);
    card.addEventListener('click', () => {
      updateState('theme', { ...preset.theme });
      applyTheme();
      syncThemeInputs();
      renderAllWidgets();
      setActiveThemeCard(preset.name);
    });
    host.appendChild(card);
    themeCards[preset.name] = card;
  }
  setActiveThemeCard('GitHub');
}

const themePickers: Partial<Record<keyof ThemeColors, ColorPicker>> = {};

/** Apply the current theme to the CSS custom properties (live site-wide). */
function applyTheme(): void {
  const root = document.documentElement;
  for (const { key } of THEME_KEYS) {
    root.style.setProperty(THEME_VAR_MAP[key], state.theme[key]);
  }
}

function syncThemeInputs(): void {
  for (const { key, id } of THEME_KEYS) {
    const picker = themePickers[key];
    if (picker) picker.setValue(state.theme[key]);
    const hex = document.getElementById(`${id}-hex`) as HTMLInputElement | null;
    if (hex) hex.value = state.theme[key];
  }
}

function initThemeControls(): void {
  for (const { key, id } of THEME_KEYS) {
    const host = document.getElementById(id) as HTMLInputElement | null;
    const hex = document.getElementById(`${id}-hex`) as HTMLInputElement | null;
    if (!host) continue;
    const apply = (v: string): void => {
      if (!/^#([0-9a-f]{6})$/i.test(v)) return;
      updateState('theme', { ...state.theme, [key]: v.toLowerCase() });
      applyTheme();
      renderAllWidgets(); // widgets fall back to the theme accent
    };
    // Replace the native color input with the swatch + popover picker
    const picker = createColorPicker({
      value: state.theme[key],
      onChange: (v) => {
        if (hex) hex.value = v;
        apply(v);
      },
      onCommit: apply,
    }, null, host);
    themePickers[key] = picker;
    hex?.addEventListener('change', () => {
      const v = hex.value.trim();
      if (/^#([0-9a-f]{6})$/i.test(v)) picker.setValue(v.toLowerCase());
      apply(v);
    });
  }
  const resetBtn = document.getElementById('btn-theme-reset');
  resetBtn?.addEventListener('click', () => {
    updateState('theme', { ...DEFAULT_THEME });
    applyTheme();
    syncThemeInputs();
    renderAllWidgets();
    setActiveThemeCard('GitHub');
  });
}

// Load Config button - import an exported config JSON via loadFromJson()
const configFileInput = document.createElement('input');
configFileInput.type = 'file';
configFileInput.accept = '.json';
configFileInput.style.display = 'none';
document.body.appendChild(configFileInput);

(document.getElementById('btn-load-config') as HTMLButtonElement).addEventListener('click', () => configFileInput.click());

configFileInput.addEventListener('change', () => {
  const file = configFileInput.files?.[0];
  // Reset the input so the same file can be re-picked
  configFileInput.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string);
      if (!data || typeof data !== 'object' || !data.grid) {
        throw new Error('Not a valid Shapegrid config: missing grid data');
      }
      loadFromJson(data);
      applyTheme();
      syncThemeInputs();
      scheduleRebuild();
      setStatus(`✓ Loaded config ${file.name}`, 'ok');
    } catch (e: any) {
      setStatus(e.message, 'error');
    }
  };
  reader.onerror = () => setStatus('Failed to read config file', 'error');
  reader.readAsText(file);
});
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
const continentSelect = document.getElementById('inp-continent') as HTMLSelectElement;

function activeContinent(): string {
  return continentSelect ? continentSelect.value : 'all';
}

function populateContinents() {
  if (!continentSelect) return;
  const continents = getContinents();
  // Keep the 'all' option, add continents (idempotent)
  for (const c of continents) {
    if (![...continentSelect.options].some(o => o.value === c)) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      continentSelect.appendChild(opt);
    }
  }
}

function renderCountryList() {
  countryGrid.innerHTML = '';
  const continent = activeContinent();
  const entries = getCountryList().filter(c => continent === 'all' || c.continent === continent);
  if (entries.length === 0) {
    countryGrid.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:10px">Loading countries...</div>';
    return;
  }
  for (const { code, name } of entries) {
    const btn = document.createElement('button');
    btn.className = 'country-grid-item';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'country-name';
    nameSpan.textContent = name;
    const codeSpan = document.createElement('span');
    codeSpan.className = 'country-code';
    codeSpan.textContent = code;
    btn.appendChild(nameSpan);
    btn.appendChild(codeSpan);
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
  const resolvedCs = coordCs === 'auto' ? (isLikelyLonLat(country.coords) ? 'wgs84' : 'planar') : coordCs;
  const normalized = normWithCoordSystem(country.coords, coordCs);
  updateState('poly', normalized);
  updateState('coordSystem', resolvedCs);
  // Real-world unit support: keep the raw lon/lat bounds when a geographic
  // coordinate system is active (cleared for planar so units stay normalized).
  updateState('geoBounds', (resolvedCs === 'wgs84' || resolvedCs === 'mercator') ? getCountryBounds(code) : null);
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
  const continent = activeContinent();
  const results = searchCountries(q).filter(c => continent === 'all' || c.continent === continent);
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
    const nameSpan = document.createElement('span');
    nameSpan.textContent = c.name;
    const codeSpan = document.createElement('span');
    codeSpan.className = 'country-code';
    codeSpan.textContent = c.code;
    item.appendChild(nameSpan);
    item.appendChild(codeSpan);
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

// Continent filter
continentSelect.addEventListener('change', () => {
  countrySearch.value = '';
  countryDropdown.innerHTML = '';
  countryDropdown.classList.remove('visible');
  countryGrid.style.display = '';
  renderCountryList();
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
    setSelectValue('inp-rt-samples', String(state.rayTracingSamples));
    setSliderValue('inp-rt-bounces', state.rayTracingBounces);
    setCheckboxValue('inp-ray-tracing', state.rayTracingEnabled);
    setCheckboxValue('inp-rt-denoise', rtDenoise);
    setSelectValue('inp-rt-scale', String(rtRenderScale));
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
      applyTheme();
      syncThemeInputs();
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

    // Preload country boundaries
    initCountries().then(() => {
      populateContinents();
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
        // Final-render capture with preview modal (3D + widgets, chrome stripped)
        showExportPreview().catch(e => console.error('Screenshot failed:', e));
      },
    });
    syncToolbarState();

    // Measurement overlay
    initMeasureOverlay();

    // Dashboard widget manager
    initWidgetManager();

    // Theme colors (applies defaults, wires the pickers)
    initThemeControls();
    initThemePresets();
    initThemeWidgetColors();
    applyTheme();
    syncThemeInputs();

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
