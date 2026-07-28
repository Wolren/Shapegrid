/**
 * render-png.ts
 * Headless Three.js PNG renderer — produces pixel-identical output
 * to the interactive web viewer using software WebGL (gl).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import gl from 'gl';
import { PNG } from 'pngjs';
/**
 * Render a shapegrid scene to PNG using headless WebGL.
 * The scene setup mirrors the interactive web viewer (app.ts) exactly.
 */
export function renderPng(opts) {
    const { width, height } = opts;
    const json = readFileSync(opts.dataPath, 'utf8');
    const data = JSON.parse(json);
    const bgColor = data.config?.render?.background ?? '#0d1117';
    const gap = data.config?.render?.gap ?? 0.08;
    const heightScale = data.config?.render?.heightScale ?? 1;
    const showBoundary = data.config?.render?.showBoundary ?? false;
    const yaw = data.config?.camera?.yaw ?? 30;
    const pitch = data.config?.camera?.pitch ?? 45;
    const palette = data.config?.theme?.palette ?? 'ocean';
    const cells = data.grid.cells;
    const cellSize = data.grid.cellSize * (1 - gap);
    const gridType = data.grid.type;
    // ── Headless WebGL context ────────────────────────────────────────────────
    const ctx = gl(width, height, {
        preserveDrawingBuffer: true,
        antialias: true,
    });
    if (!ctx) {
        throw new Error('Failed to create headless WebGL context');
    }
    const canvas = {
        width,
        height,
        clientWidth: width,
        clientHeight: height,
        style: {},
        addEventListener: () => { },
        removeEventListener: () => { },
        getContext: (type) => (type === 'webgl' || type === 'webgl2' ? ctx : null),
    };
    // ── Three.js setup ────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);
    renderer.setClearColor(bgColor, 1);
    const scene = new THREE.Scene();
    const asp = width / height;
    const fs = 1.3;
    const camera = new THREE.OrthographicCamera(-fs * asp / 2, fs * asp / 2, fs / 2, -fs / 2, 0.01, 100);
    // Camera position from yaw/pitch
    const yawRad = (yaw * Math.PI) / 180;
    const pitchRad = (pitch * Math.PI) / 180;
    const dist = 2.5;
    camera.position.set(dist * Math.sin(yawRad) * Math.cos(pitchRad), dist * Math.sin(pitchRad), dist * Math.cos(yawRad) * Math.cos(pitchRad));
    camera.lookAt(0, 0, 0);
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
    // ── Lights (matches web viewer) ───────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(2, 4, 3);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x6688cc, 0.25);
    fillLight.position.set(-2, 2, -3);
    scene.add(fillLight);
    // ── Ground plane (receives shadows) ───────────────────────────────────────
    const gGeo = new THREE.PlaneGeometry(4, 4);
    const gMat = new THREE.ShadowMaterial({ opacity: 0.12 });
    const ground = new THREE.Mesh(gGeo, gMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    // ── Build grid mesh ───────────────────────────────────────────────────────
    // Colour palette lookup
    const paletteColors = getPalette(palette);
    const colorStops = paletteColors.colors;
    function intensityColor(intensity) {
        const t = Math.max(0, Math.min(1, intensity));
        if (t <= 0)
            return new THREE.Color(colorStops[0]);
        const segments = colorStops.length - 1;
        const seg = Math.min(Math.floor(t * segments), segments - 1);
        const localT = (t * segments) - seg;
        const c1 = new THREE.Color(colorStops[seg]);
        const c2 = new THREE.Color(colorStops[seg + 1]);
        c1.lerp(c2, localT);
        return c1;
    }
    function darkenHex(color, factor) {
        return color.clone().multiplyScalar(factor);
    }
    function lightenHex(color, factor) {
        return color.clone().multiplyScalar(factor);
    }
    const N = cells.length;
    let geo;
    if (gridType === 'square') {
        geo = new THREE.BoxGeometry(cellSize, 1, cellSize);
    }
    else {
        geo = new THREE.CylinderGeometry(cellSize / 2, cellSize / 2, 1, 6);
    }
    const mat = new THREE.MeshLambertMaterial();
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.castShadow = true;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
        const cell = cells[i];
        const h = Math.max(0.008, cell.intensity * heightScale * 0.12 + 0.008);
        dummy.position.set(cell.cx - 0.5, h / 2, cell.cy - 0.5);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const css = intensityColor(cell.intensity);
        mesh.setColorAt(i, css);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor)
        mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    // ── Boundary outline ──────────────────────────────────────────────────────
    if (showBoundary && data.boundary) {
        const pts = data.boundary.map(([x, y]) => new THREE.Vector3(x - 0.5, 0.02, y - 0.5));
        const bGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const bMat = new THREE.LineBasicMaterial({ color: 0x666666 });
        const boundaryLine = new THREE.LineLoop(bGeo, bMat);
        scene.add(boundaryLine);
    }
    // ── Render ────────────────────────────────────────────────────────────────
    renderer.render(scene, camera);
    // ── Read pixels and save ──────────────────────────────────────────────────
    const pixelData = new Uint8Array(width * height * 4);
    ctx.readPixels(0, 0, width, height, ctx.RGBA, ctx.UNSIGNED_BYTE, pixelData);
    // Flip Y (WebGL origin is bottom-left, PNG is top-left)
    const flipped = new Uint8Array(width * height * 4);
    const rowSize = width * 4;
    for (let y = 0; y < height; y++) {
        const srcOffset = y * rowSize;
        const dstOffset = (height - 1 - y) * rowSize;
        flipped.set(pixelData.subarray(srcOffset, srcOffset + rowSize), dstOffset);
    }
    const png = new PNG({ width, height });
    png.data = Buffer.from(flipped);
    writeFileSync(opts.outputPath, PNG.sync.write(png));
    // Cleanup
    renderer.dispose();
    ctx.destroy();
}
const BUILTIN_PALETTES = {
    github: { name: 'GitHub', colors: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'] },
    warm: { name: 'Warm', colors: ['#1a0a00', '#7a2e00', '#c05000', '#e88030', '#ffe0b0'] },
    cool: { name: 'Cool', colors: ['#0a0a1a', '#0d3060', '#1560a8', '#40a0e0', '#b0e0ff'] },
    mono: { name: 'Mono', colors: ['#1a1a1a', '#3a3a3a', '#666666', '#a0a0a0', '#e0e0e0'] },
    neon: { name: 'Neon', colors: ['#050510', '#1a0040', '#4400cc', '#8800ff', '#cc44ff'] },
    forest: { name: 'Forest', colors: ['#0d1a0d', '#1a3d1a', '#2d6e2d', '#4caf50', '#a8e6a3'] },
    sunset: { name: 'Sunset', colors: ['#1a0010', '#6b0030', '#c0005a', '#ff4090', '#ffb0d0'] },
    ocean: { name: 'Ocean', colors: ['#000d1a', '#003060', '#0070b0', '#00aad0', '#80e8ff'] },
    fire: { name: 'Fire', colors: ['#1a0000', '#6b1000', '#c04000', '#ff8000', '#ffee00'] },
    pastel: { name: 'Pastel', colors: ['#1a1a2e', '#6a4c93', '#c9a0dc', '#f4c6e0', '#fff5f0'] },
    arctic: { name: 'Arctic', colors: ['#001020', '#003080', '#0080d0', '#60c8f0', '#e0f8ff'] },
    gold: { name: 'Gold', colors: ['#1a1200', '#5a3c00', '#b07000', '#e0a800', '#ffe060'] },
};
function getPalette(name) {
    return BUILTIN_PALETTES[name] ?? BUILTIN_PALETTES.ocean;
}
//# sourceMappingURL=render-png.js.map