/**
 * renderer/src/index.ts
 *
 * Three.js WebGL renderer for shapegrid.
 * Renders square or hexagonal 3D cells inside a boundary polygon,
 * coloured by contribution intensity with configurable camera angles.
 *
 * Designed to run in browser (GitHub Pages / web app).
 * For server-side PNG export, wrap with puppeteer or headless-gl.
 */

import type { GridResult, Cell } from '@shapegrid/core';
import type { CellData, ColorScale } from '@shapegrid/core';
import type { Polygon } from '@shapegrid/core';
import { intensityToColor } from '@shapegrid/core';

// Three.js is loaded from CDN in browser; import types only here.
// At runtime, THREE is available as window.THREE when using the CDN build.
declare const THREE: typeof import('three');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RenderConfig {
  /** Canvas element to render into */
  canvas: HTMLCanvasElement;

  grid: GridResult;
  cellData: CellData[];
  boundary: Polygon;

  colorScale: ColorScale;

  /** Camera yaw in degrees (horizontal rotation) */
  yaw: number;
  /** Camera pitch in degrees (0 = top-down, 30 = slight angle, 60 = steep) */
  pitch: number;

  /** Extrusion height multiplier. 0 = flat, 1 = normal, 2 = dramatic */
  heightScale: number;

  /** Draw the boundary polygon outline */
  showBoundary: boolean;

  /** Background colour */
  background: string;

  /** Cell spacing gap (fraction of cell size, 0–0.3) */
  gap: number;

  /** Corner rounding for square cells (0–1) */
  cornerRadius: number;

  /** Ambient light intensity */
  ambientIntensity: number;
}

export interface RendererInstance {
  /** Re-render with new config */
  update(config: Partial<RenderConfig>): void;
  /** Export current frame as a PNG data URL */
  exportPng(width?: number, height?: number): string;
  /** Clean up Three.js resources */
  dispose(): void;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

// ─── Geometry builders ────────────────────────────────────────────────────────

function makeSquareGeometry(cellSize: number, gap: number): import('three').BufferGeometry {
  const s = cellSize * (1 - gap);
  return new THREE.BoxGeometry(s, 1, s); // height = 1, scaled by matrix
}

function makeHexGeometry(cellSize: number, gap: number): import('three').BufferGeometry {
  // Cylinder with 6 sides = hexagonal prism
  const r = cellSize * 0.5 * (1 - gap);
  return new THREE.CylinderGeometry(r, r, 1, 6);
}

// ─── Boundary line ────────────────────────────────────────────────────────────

function makeBoundaryLine(poly: Polygon, scale: number): import('three').LineLoop {
  const pts: import('three').Vector3[] = poly.map(([x, y]) =>
    new THREE.Vector3((x - 0.5) * scale, 0.05, (y - 0.5) * scale)
  );
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x888888, linewidth: 1.5 });
  return new THREE.LineLoop(geo, mat);
}

// ─── Main renderer factory ────────────────────────────────────────────────────

export function createRenderer(config: RenderConfig): RendererInstance {
  const { canvas } = config;

  // Scene
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true, // needed for PNG export
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Camera
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const frustumSize = 1.4;
  const camera = new THREE.OrthographicCamera(
    (-frustumSize * aspect) / 2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    -frustumSize / 2,
    0.1,
    100
  );

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, config.ambientIntensity ?? 0.6);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(2, 4, 3);
  dirLight.castShadow = true;
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
  fillLight.position.set(-2, 2, -3);
  scene.add(fillLight);

  // State
  let mesh: import('three').InstancedMesh | null = null;
  let boundaryLine: import('three').LineLoop | null = null;
  let currentConfig = { ...config };

  const SCALE = 1.0; // normalised space is [0,1] → world space

  function buildScene(cfg: RenderConfig) {
    // Clear old objects
    if (mesh) { scene.remove(mesh); mesh.dispose(); mesh = null; }
    if (boundaryLine) { scene.remove(boundaryLine); boundaryLine = null; }

    const { grid, cellData, boundary, colorScale, heightScale, showBoundary, gap } = cfg;
    const count = grid.cells.length;

    // Build geometry
    const geo =
      grid.gridType === 'square'
        ? makeSquareGeometry(grid.cellSize * SCALE, gap ?? 0.08)
        : makeHexGeometry(grid.cellSize * SCALE, gap ?? 0.08);

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Ground plane for shadows
    const groundGeo = new THREE.PlaneGeometry(3, 3);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    grid.cells.forEach((cell: Cell, i: number) => {
      const data = cellData[i] ?? { intensity: 0, count: 0 };
      const h = Math.max(0.01, data.intensity * (heightScale ?? 1) * 0.12 + 0.01);
      const x = (cell.cx - 0.5) * SCALE;
      const z = (cell.cy - 0.5) * SCALE;

      dummy.position.set(x, h / 2, z);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      mesh!.setMatrixAt(i, dummy.matrix);

      const hex = intensityToColor(data.intensity, colorScale);
      const [r, g, b] = hexToRgb(hex);
      color.setRGB(r, g, b);
      mesh!.setColorAt(i, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    scene.add(mesh);

    // Boundary outline
    if (showBoundary) {
      boundaryLine = makeBoundaryLine(boundary, SCALE);
      scene.add(boundaryLine);
    }
  }

  function positionCamera(cfg: RenderConfig) {
    const yawRad = (cfg.yaw * Math.PI) / 180;
    const pitchRad = (cfg.pitch * Math.PI) / 180;
    const dist = 2.5;

    const x = dist * Math.sin(yawRad) * Math.cos(pitchRad);
    const y = dist * Math.sin(pitchRad);
    const z = dist * Math.cos(yawRad) * Math.cos(pitchRad);

    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
  }

  function applyBackground(cfg: RenderConfig) {
    renderer.setClearColor(
      new THREE.Color(cfg.background ?? '#0d1117'),
      1
    );
  }

  function render(cfg: RenderConfig) {
    buildScene(cfg);
    positionCamera(cfg);
    applyBackground(cfg);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.render(scene, camera);
  }

  // Initial render
  render(currentConfig);

  // Animation loop (for smooth interactivity)
  let animId: number;
  let dirty = false;

  function loop() {
    animId = requestAnimationFrame(loop);
    if (dirty) {
      render(currentConfig);
      dirty = false;
    }
  }
  loop();

  return {
    update(partial: Partial<RenderConfig>) {
      currentConfig = { ...currentConfig, ...partial };
      dirty = true;
    },

    exportPng(width = 1200, height = 630): string {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = width;
      offCanvas.height = height;
      const offRenderer = new THREE.WebGLRenderer({
        canvas: offCanvas,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      offRenderer.setSize(width, height);
      offRenderer.setClearColor(new THREE.Color(currentConfig.background), 1);

      const offAspect = width / height;
      const fSize = 1.4;
      const offCam = new THREE.OrthographicCamera(
        (-fSize * offAspect) / 2, (fSize * offAspect) / 2,
        fSize / 2, -fSize / 2,
        0.1, 100
      );

      const yawRad = (currentConfig.yaw * Math.PI) / 180;
      const pitchRad = (currentConfig.pitch * Math.PI) / 180;
      const dist = 2.5;
      offCam.position.set(
        dist * Math.sin(yawRad) * Math.cos(pitchRad),
        dist * Math.sin(pitchRad),
        dist * Math.cos(yawRad) * Math.cos(pitchRad)
      );
      offCam.lookAt(0, 0, 0);
      offCam.updateProjectionMatrix();

      offRenderer.render(scene, offCam);
      const dataUrl = offCanvas.toDataURL('image/png');
      offRenderer.dispose();
      return dataUrl;
    },

    dispose() {
      cancelAnimationFrame(animId);
      if (mesh) mesh.dispose();
      renderer.dispose();
    },
  };
}
