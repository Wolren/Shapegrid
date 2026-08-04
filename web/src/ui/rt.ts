// ══════════════════════════════════════════════════════════════════════════════
// Ray tracing module - WebGLPathTracer integration, RT scene building, loop
// Extracted from app.ts (file-size governance)
// ══════════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { WebGLPathTracer, DenoiseMaterial } from 'three-gpu-pathtracer';
import { state } from './state';
import { needsRebuild } from './rebuild';
import { getEditor } from './editor-state';
import { updateMeasureOverlay } from './measure';
import { renderer, camera, scene, mesh, boundaryLine, composer, groundMesh, canvas, coordAxesGroup, cssToRgb01, bgColor, posCamera, buildMesh, applyPostProcessing, setSceneBackground } from './scene';
import { intensityToColor, activePaletteId } from '../rendering/colors';

// ══════════════════════════════════════════════════════════════════════════════

let pathTracer: any = null;
let rtSceneGroup: THREE.Group | null = null;
let rtTargetSamples = 32;
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

  // Ground plane - path tracer needs a real surface material (no ShadowMaterial)
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
  // composer paths - three.js converts it to the render target's color space)
  let bg = bgColor;
  if (!bg) {
    setSceneBackground(new THREE.Color());
    bg = bgColor;
  }
  if (!scene.background) scene.background = bg;
  if (bg!.getStyle() !== state.background) bg!.set(state.background);
  // Keep the clear color in sync too (used for the underlying RT clear)
  renderer.setClearColor(state.background, 1);

  // Ray tracing path - accumulate samples to the quality target
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

  // Skip composer when all effects are off - matches original direct render path
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



// ── State access for the wiring module (imported bindings can't be assigned) ─
export function setRtDenoise(v: boolean): void {
  rtDenoise = v;
}
export function setRtRenderScale(v: number): void {
  rtRenderScale = v;
}
export function getRtRenderScale(): number {
  return rtRenderScale;
}
export function markRTBlitStale(): void {
  lastBlitSamples = -1;
}

export function restartRTAccumulation(): void {
  if (!isRTAvailable()) return;
  pathTracer.reset();
  rtPendingReset = false;
  lastBlitSamples = -1;
}

// ── Exports for wiring, capture and bootstrap ─────────────────────────────────
export {
  initRayTracing, rebuildRTScene, notifyRTViewChanged, ensureRTSamples,
  disposeRTScene, denoiseBlit, loop, ensureDenoiseSetup, isRTAvailable,
  pathTracer, rtDenoise, rtTargetSamples,
};
