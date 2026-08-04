// ══════════════════════════════════════════════════════════════════════════════
// Scene module - Three.js setup, mesh/coord-axes building, camera, lighting
// Extracted from app.ts (file-size governance)
// ══════════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { state } from './state';
import { getEditor } from './editor-state';
import { intensityToColor, colToHex, activePaletteId } from '../rendering/colors';

const canvas = document.getElementById('canvas-main') as HTMLCanvasElement;
let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.OrthographicCamera;
let dirLight: THREE.DirectionalLight, mesh: THREE.InstancedMesh | null, boundaryLine: THREE.LineLoop | null;
let groundMesh: THREE.Mesh;
let coordAxesGroup: THREE.Group | null;
let composer: EffectComposer | null = null;
// Color-managed background - required for the composer path: the EffectComposer
// renders into a linear HDR target, and a raw clear color (sRGB) would be
// re-encoded by OutputPass, brightening dark backgrounds to grey.
let bgColor: THREE.Color | null = null;

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
// (~0.05–0.3ms each) - pure waste at thousands of cells, and intensityToColor
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

// Cache key of the last-built axes - buildMesh calls buildCoordAxes() on every
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

  // Bottom axis line (longitude) - from corner to right
  const bottomLine = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cornerX, y, cornerZ),
    new THREE.Vector3(right, y, cornerZ)
  ]);
  coordAxesGroup.add(new THREE.Line(bottomLine, lineMat));

  // Left axis line (latitude) - from top to corner
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

  // Longitude ticks (bottom) - at original grid positions, Z = cornerZ
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

  // Latitude ticks (left side) - at original grid positions, X = cornerX
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
  // Ray tracing replaces the whole post chain - skip bloom/fog/env management
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


// RT and capture assign the scene background - expose a setter (imported
// bindings cannot be reassigned).
export function setSceneBackground(color: THREE.Color | null): void {
  bgColor = color;
}

// ── Exports for the RT, capture and wiring modules ────────────────────────────
export {
  canvas, renderer, scene, camera, mesh, boundaryLine, coordAxesGroup,
  composer, bgColor, bloomNode, groundMesh, cssToRgb01,
  initThree, posCamera, scaleIntensity, buildMesh, buildCoordAxes, applyPostProcessing,
};
