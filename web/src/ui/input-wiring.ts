// ══════════════════════════════════════════════════════════════════════════════
// Input wiring - settings sliders, toggles, selects wired to state + rebuild
// Extracted from app.ts (file-size governance)
// ══════════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { state, updateState } from './state';
import { computeGrid, loadDemo, loadData } from './data';
import { fetchAndUpdateLanguages } from './github-langs';
import { scheduleRebuild } from './rebuild';
import { posCamera, scene, bloomNode, renderer } from './scene';
import { initRayTracing, rebuildRTScene, disposeRTScene, denoiseBlit, isRTAvailable, pathTracer, rtDenoise, setRtDenoise, setRtRenderScale, getRtRenderScale, restartRTAccumulation, markRTBlitStale, ensureDenoiseSetup } from './rt';

export function setDaysMode(mode: 'last' | 'years' | 'range') {
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
export function buildYearChips() {
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

export function syncToDom(key: string) {
  const el = document.getElementById(`inp-${key}`) as HTMLInputElement;
  if (!el) return;
  el.value = String(state[key as keyof typeof state]);
  updateLabels();
}

export function updateLabels() {
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

// Sliders - map input IDs to state keys where they differ
['yaw', 'pitch', 'gap', 'coverage'].forEach(key => {
  const el = document.getElementById(`inp-${key}`) as HTMLInputElement;
  if (el) {
    el.addEventListener('input', () => {
      sync(key);
      if (key === 'coverage') {
        // Coverage threshold changes which cells survive generation - regen.
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
// Height scale factor slider - state key differs from input ID
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

export function syncDaysToCount() {
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
      restartRTAccumulation();
    }
  });
  (document.getElementById('inp-rt-bounces') as HTMLInputElement).addEventListener('input', e => {
    state.rayTracingBounces = parseInt((e.target as HTMLInputElement).value);
    if (isRTAvailable() && state.rayTracingEnabled) {
      pathTracer.bounces = state.rayTracingBounces;
      restartRTAccumulation();
    }
    updateLabels();
  });
  // Denoise toggle - when enabled after the target is already accumulated,
  // blit immediately so the canvas switches to the denoised image
  (document.getElementById('inp-rt-denoise') as HTMLInputElement).addEventListener('change', e => {
    setRtDenoise((e.target as HTMLInputElement).checked);
    if (rtDenoise && isRTAvailable() && state.rayTracingEnabled && pathTracer.samples >= state.rayTracingSamples) {
      ensureDenoiseSetup();
      denoiseBlit();
    }
    markRTBlitStale();
  });
  // Render scale - restart accumulation at the new internal resolution
  (document.getElementById('inp-rt-scale') as HTMLSelectElement).addEventListener('change', e => {
    setRtRenderScale(parseFloat((e.target as HTMLSelectElement).value));
    if (isRTAvailable() && state.rayTracingEnabled) {
      pathTracer.renderScale = getRtRenderScale();
      restartRTAccumulation();
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

// Export PNG - capture the FINAL render: 3D view + dashboard widgets, with
// all editor chrome stripped, matching the CI-rendered output.



