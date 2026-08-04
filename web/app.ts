// ══════════════════════════════════════════════════════════════════════════════
// Shapegrid - Main Application Entry Point
// Three.js scene setup, camera controls, and UI wiring
// ══════════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { exportConfig } from './src/ui/export-config';
import { showExportPreview } from './src/ui/capture-export';
import { applyTheme, syncThemeInputs, initThemeControls, initThemePresets, initThemeWidgetColors } from './src/ui/theme-system';
import { loop, notifyRTViewChanged, rtDenoise, getRtRenderScale } from './src/ui/rt';
import { initThree, posCamera, applyPostProcessing, camera, mesh, canvas, bloomNode } from './src/ui/scene';

import { state, updateState, setPreset } from './src/ui/state';
import { setActivePalette, buildLegend } from './src/rendering/colors';
import { loadDemo, computeGrid, setStatus, loadFromUrl, loadFromJson } from './src/ui/data';
import { initPaletteUI } from './src/ui/palette-ui';
import { scheduleRebuild } from './src/ui/rebuild';
import { setDaysMode, buildYearChips, updateLabels, syncToDom, syncDaysToCount } from './src/ui/input-wiring';
import { populateContinents, renderFeaturedCountries, updateAxesOptionsVisibility } from './src/ui/country-ui';
import { initCountries } from './src/data/countries';
import { initToolbar, syncToolbarState } from './src/ui/toolbar';
import { initMeasureOverlay, updateMeasureOverlay, handleMeasureClick, clearMeasureOverlay, isMeasuring } from './src/ui/measure';
import { getEditor, setSelectedCells, cancelMeasurement } from './src/ui/editor-state';
import { updateCellInfoWidget } from './src/ui/widget-cell-info';
import { initWidgetManager } from './src/ui/widget-manager';
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
import './src/ui/widget-top-cells';
import './src/ui/widget-weekday';
import './src/ui/widget-streak';
import './src/ui/widget-monthly';
import './src/ui/widget-geo';
import './src/ui/widget-minimap';

// ══════════════════════════════════════════════════════════════════════════════
// Three.js Scene
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// Ray tracing - GPU path tracing via three-gpu-pathtracer
// The instanced grid is converted into a merged, vertex-colored geometry
// (the path tracer does not support InstancedMesh).
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
// Measurement tool - click handling on canvas
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

// Days mode toggle
// Export Config button
(document.getElementById('btn-export-config') as HTMLButtonElement).addEventListener('click', exportConfig);

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
      buildYearChips();
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
    loop();

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
    setSelectValue('inp-rt-scale', String(getRtRenderScale()));
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
      // Loaded from CI-generated data - update palette
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

    // Initial sync days to count (skip when CI data loaded - would overwrite the grid)
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

    // Toolbar - with action callbacks
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
