// ══════════════════════════════════════════════════════════════════════════════
// Boundary UI — country/region picker, file upload, boundary source controls
// Extracted from app.ts (file-size governance)
// ══════════════════════════════════════════════════════════════════════════════

import { state, updateState } from './state';
import { computeGrid, loadDemo, setStatus } from './data';
import { scheduleRebuild } from './rebuild';
import { COUNTRIES, searchCountries, getCountryList, getCountryBounds, getContinents } from '../data/countries';
import { normWithCoordSystem, isLikelyLonLat } from '../geometry/projection';
import { parseGeoJsonFile, parseSvgFile } from '../geometry/parsers';
import type { Point2D } from '../types';

const countrySearch = document.getElementById('country-search') as HTMLInputElement;
const countryDropdown = document.getElementById('country-dropdown')!;
const countryGrid = document.getElementById('country-grid')!;
const continentSelect = document.getElementById('inp-continent') as HTMLSelectElement;

function activeContinent(): string {
  return continentSelect ? continentSelect.value : 'all';
}

export function populateContinents() {
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
export function renderFeaturedCountries() {
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

export function updateAxesOptionsVisibility() {
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

