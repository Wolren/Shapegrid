// ══════════════════════════════════════════════════════════════════════════════
// Export capture - final-render composite (3D canvas + widget overlays)
// Extracted from app.ts (file-size governance)
// ══════════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import html2canvas from 'html2canvas';
import { state } from './state';
import { renderer, camera, scene, composer, posCamera, scaleIntensity } from './scene';
import { notifyRTViewChanged, ensureRTSamples, isRTAvailable } from './rt';
import { showExportModal } from './export-modal';

export async function captureFinalRender(): Promise<{ canvas: HTMLCanvasElement; w: number; h: number; format: string; scale: number } | null> {
  const wrap = document.getElementById('canvas-wrap')!;
  const wrapRect = wrap.getBoundingClientRect();
  if (wrapRect.width < 10 || wrapRect.height < 10) return null;
  // Grid world-space AABB (cells centered at cx-0.5, cy-0.5, raised to h).
  let gridAabb: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number } | null = null;
  if (state.grid && state.grid.cells.length > 0) {
    const xs = state.grid.cells.map(c => c.cx - 0.5);
    const zs = state.grid.cells.map(c => c.cy - 0.5);
    let maxY = 0.008;
    state.grid.cells.forEach((_cell, i) => {
      const d = state.cellData[i] || { intensity: 0, count: 0 };
      const h = Math.max(0.008, scaleIntensity(d.intensity) * state.heightScale * 0.12 + 0.008);
      if (h > maxY) maxY = h;
    });
    gridAabb = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), maxY };
  }
  // Default export resolution = the webview's own canvas size, so the
  // export matches what the user sees (blank inputs fall back to it).
  const wIn = (document.getElementById('inp-export-w') as HTMLInputElement).value;
  const hIn = (document.getElementById('inp-export-h') as HTMLInputElement).value;
  let w = wIn ? Math.round(+wIn) : Math.round(wrapRect.width);
  let h = hIn ? Math.round(+hIn) : Math.round(wrapRect.height);
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

  const origW = renderer.domElement.width, origH = renderer.domElement.height;
  const origLeft = camera.left, origRight = camera.right;
  const origTop = camera.top, origBottom = camera.bottom;

  // Strip editor chrome (toolbar, tooltip, measure overlay, widget close buttons)
  document.body.classList.add('export-mode');

  try {
    if (autocrop && gridAabb) {
      const { minX, maxX, minZ, maxZ, maxY } = gridAabb;
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
    // The trim bounding box applies to the render itself: seed with the
    // grid's projected screen-space AABB (computed from the fitted camera),
    // then union every visible widget rect so nothing clips.
    let bbox: { x0: number; y0: number; x1: number; y1: number } = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const union = (x0: number, y0: number, x1: number, y1: number) => {
      bbox.x0 = Math.min(bbox.x0, x0); bbox.y0 = Math.min(bbox.y0, y0);
      bbox.x1 = Math.max(bbox.x1, x1); bbox.y1 = Math.max(bbox.y1, y1);
    };
    // Seed: the grid's projected AABB through the current ortho camera.
    if (gridAabb) {
      camera.updateMatrixWorld();
      const f = new THREE.Vector3();
      camera.getWorldDirection(f);
      let right = new THREE.Vector3().crossVectors(f, camera.up);
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, f);
      const { minX, maxX, minZ, maxZ, maxY } = gridAabb;
      const toScreen = (wx: number, wy: number, wz: number) => {
        const eye = camera.position;
        const dx = wx - eye.x, dy = wy - eye.y, dz = wz - eye.z;
        const vx = dx * right.x + dy * right.y + dz * right.z;
        const vy = dx * up.x + dy * up.y + dz * up.z;
        const sx = ((vx - camera.left) / (camera.right - camera.left)) * w;
        const sy = ((camera.top - vy) / (camera.top - camera.bottom)) * h;
        return { sx, sy };
      };
      for (const wx of [minX, maxX]) {
        for (const wy of [0, maxY]) {
          for (const wz of [minZ, maxZ]) {
            const p = toScreen(wx, wy, wz);
            union(p.sx, p.sy, p.sx, p.sy);
          }
        }
      }
    } else {
      union(0, 0, w, h);
    }
    for (const el of widgets) {
      const r = el.getBoundingClientRect();
      // Skip widgets outside the visible wrap area
      if (r.bottom < wrapRect.top || r.top > wrapRect.bottom) continue;
      if (r.width < 4 || r.height < 4) continue;

      const dx = ((r.left - wrapRect.left) / wrapRect.width) * w;
      const dy = ((r.top - wrapRect.top) / wrapRect.height) * h;
      const dw = (r.width / wrapRect.width) * w;
      const dh = (r.height / wrapRect.height) * h;
      union(dx, dy, dx + dw, dy + dh);

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

    // Optional title text - drawn on top of the composite, scaled with the render
    if (exportTitle) {
      const titleText = exportTitle.length > 60 ? exportTitle.slice(0, 60) + '…' : exportTitle;
      ctx.font = `600 ${Math.round(44 * w / 1200)}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(titleText, w / 2 + 3, 56 * w / 1200 + 3);
      ctx.fillStyle = '#e6edf3';
      ctx.fillText(titleText, w / 2, 56 * w / 1200);
    }

    // ── Trim: crop the output to the union bounding box (all sides) ──────
    {
      const x0 = Math.max(0, Math.floor(bbox.x0));
      const y0 = Math.max(0, Math.floor(bbox.y0));
      const x1 = Math.min(w, Math.ceil(bbox.x1));
      const y1 = Math.min(h, Math.ceil(bbox.y1));
      const tw = x1 - x0, th = y1 - y0;
      if (tw > 0 && th > 0 && (tw !== w || th !== h)) {
        const trimmed = document.createElement('canvas');
        trimmed.width = tw; trimmed.height = th;
        trimmed.getContext('2d')!.drawImage(out, x0, y0, tw, th, 0, 0, tw, th);
        return { canvas: trimmed, w: tw, h: th, format: exportFormat, scale: exportScale };
      }
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

export function downloadCanvas(canvas: HTMLCanvasElement, format: string = 'png'): void {
  const link = document.createElement('a');
  const ext = format === 'jpg' ? 'jpg' : format === 'webp' ? 'webp' : 'png';
  link.download = `shapegrid-${Date.now()}.${ext}`;
  if (format === 'jpg') link.href = canvas.toDataURL('image/jpeg', 0.92);
  else if (format === 'webp') link.href = canvas.toDataURL('image/webp', 0.92);
  else link.href = canvas.toDataURL('image/png');
  link.click();
}

/** Run the final-render capture and show the preview modal. */
export async function showExportPreview(): Promise<void> {
  const result = await captureFinalRender();
  if (!result) return;
  const format = result.format;
  showExportModal(result.canvas, result.w, result.h, () => {
    downloadCanvas(result.canvas, format);
  });
}


// ── Theme colors ─────────────────────────────────────────────────────────────
