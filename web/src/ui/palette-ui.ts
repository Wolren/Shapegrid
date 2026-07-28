// ══════════════════════════════════════════════════════════════════════════════
// Palette UI - DOM rendering and event handlers
// ══════════════════════════════════════════════════════════════════════════════

import {
  PALETTES,
  activePaletteId,
  setActivePalette,
  updatePaletteColors,
  addPalette,
  deletePalette,
} from '../rendering/colors';
import { scheduleRebuild } from './rebuild';

let _editingSwatchIdx = 0;
let _editPaletteColors: string[] = [...PALETTES[activePaletteId].colors];

export function getEditingSwatchIdx() { return _editingSwatchIdx; }
export function getEditPaletteColors() { return [..._editPaletteColors]; }
export function setEditingSwatchIdx(idx: number) { _editingSwatchIdx = idx; }
export function setEditPaletteColors(colors: string[]) { _editPaletteColors = colors; }

export function buildPaletteUI() {
  const list = document.getElementById('palette-list');
  if (!list) return;
  list.innerHTML = '';
  
  Object.entries(PALETTES).forEach(([id, p]) => {
    const item = document.createElement('div');
    item.className = 'palette-item' + (id === activePaletteId ? ' active' : '');
    
    const swatchesHtml = p.colors.map((c: string) => 
      `<div class="palette-item-swatch" style="background:${c}"></div>`
    ).join('');
    
    const isCustom = id.startsWith('custom_');
    item.innerHTML = `
      <span class="palette-item-name">${p.name}</span>
      <div class="palette-item-swatches">${swatchesHtml}</div>
      ${isCustom ? `<button class="palette-delete" data-pid="${id}" title="Delete palette">✕</button>` : ''}
    `;
    
    // Click on name or swatches to select
    item.querySelector(':scope > .palette-item-name')?.addEventListener('click', () => {
      setActivePalette(id);
      _editPaletteColors = [...p.colors];
      _editingSwatchIdx = 0;
      buildPaletteUI();
      buildSwatchEditor();
      scheduleRebuild();
      buildLegend();
    });
    
    item.querySelector(':scope > .palette-item-swatches')?.addEventListener('click', () => {
      setActivePalette(id);
      _editPaletteColors = [...p.colors];
      _editingSwatchIdx = 0;
      buildPaletteUI();
      buildSwatchEditor();
      scheduleRebuild();
      buildLegend();
    });
    
    // Delete button
    const del = item.querySelector('.palette-delete');
    if (del) {
      del.addEventListener('click', e => {
        e.stopPropagation();
        deletePalette(id);
        buildPaletteUI();
        buildLegend();
      });
    }
    
    list.appendChild(item);
  });
}

export function buildSwatchEditor() {
  const p = PALETTES[activePaletteId] || PALETTES.github;
  _editPaletteColors = [...p.colors];
  const wrap = document.getElementById('palette-swatches');
  if (!wrap) return;
  wrap.innerHTML = '';
  
  _editPaletteColors.forEach((c, i) => {
    const item = document.createElement('div');
    item.className = 'swatch' + (i === _editingSwatchIdx ? ' active' : '');
    item.style.background = c;
    item.title = c;
    
    // Click to select swatch
    item.addEventListener('click', e => {
      // Don't select if clicking delete button
      if ((e.target as HTMLElement).classList.contains('swatch-remove')) return;
      _editingSwatchIdx = i;
      const picker = document.getElementById('swatch-color-picker') as HTMLInputElement;
      const hex = document.getElementById('swatch-color-hex') as HTMLInputElement;
      if (picker) picker.value = c;
      if (hex) hex.value = c;
      buildSwatchEditor();
    });
    
    // Delete button (only if more than 2 colors)
    if (_editPaletteColors.length > 2) {
      const removeBtn = document.createElement('div');
      removeBtn.className = 'swatch-remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        _editPaletteColors.splice(i, 1);
        if (_editingSwatchIdx >= _editPaletteColors.length) {
          _editingSwatchIdx = _editPaletteColors.length - 1;
        }
        applyPaletteEdit();
        // Update picker/hex to show new selected color
        const picker = document.getElementById('swatch-color-picker') as HTMLInputElement;
        const hex = document.getElementById('swatch-color-hex') as HTMLInputElement;
        if (picker && _editPaletteColors[_editingSwatchIdx]) {
          picker.value = _editPaletteColors[_editingSwatchIdx];
        }
        if (hex && _editPaletteColors[_editingSwatchIdx]) {
          hex.value = _editPaletteColors[_editingSwatchIdx];
        }
      });
      item.appendChild(removeBtn);
    }
    
    wrap.appendChild(item);
  });
  
  // Add button if fewer than 8 stops
  if (_editPaletteColors.length < 8) {
    const add = document.createElement('div');
    add.className = 'swatch-add';
    add.textContent = '+';
    add.addEventListener('click', () => {
      _editPaletteColors.push('#ffffff');
      _editingSwatchIdx = _editPaletteColors.length - 1;
      applyPaletteEdit();
    });
    wrap.appendChild(add);
  }
}

export function applyPaletteEdit() {
  updatePaletteColors(activePaletteId, [..._editPaletteColors]);
  buildSwatchEditor();
  buildPaletteUI();
  scheduleRebuild();
  buildLegend();
}

export function buildLegend() {
  const cont = document.getElementById('legend-bar');
  if (!cont) return;
  const p = PALETTES[activePaletteId] || PALETTES.github;
  const gradient = p.colors.join(', ');
  cont.style.background = `linear-gradient(to right, ${gradient})`;
}

// Wire up palette event handlers (call once on init)
export function initPaletteUI() {
  buildPaletteUI();
  buildSwatchEditor();
  buildLegend();
  
  // Swatch color picker
  const picker = document.getElementById('swatch-color-picker') as HTMLInputElement;
  const hex = document.getElementById('swatch-color-hex') as HTMLInputElement;
  const applyBtn = document.getElementById('btn-swatch-apply');
  const saveBtn = document.getElementById('btn-save-palette');
  const nameInput = document.getElementById('new-palette-name') as HTMLInputElement;
  
  if (picker) {
    picker.addEventListener('input', e => {
      const target = e.target as HTMLInputElement;
      if (hex) hex.value = target.value;
      _editPaletteColors[_editingSwatchIdx] = target.value;
      applyPaletteEdit();
    });
  }
  
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      if (!hex) return;
      let v = hex.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
        setStatus('Invalid hex color', 'error');
        return;
      }
      _editPaletteColors[_editingSwatchIdx] = v;
      if (picker) picker.value = v;
      applyPaletteEdit();
    });
  }
  
  if (hex) {
    hex.addEventListener('change', () => {
      applyBtn?.click();
    });
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const name = nameInput?.value.trim() || 'Custom';
      const id = addPalette(name, [..._editPaletteColors]);
      setActivePalette(id);
      buildPaletteUI();
      buildSwatchEditor();
      if (nameInput) nameInput.value = '';
      setStatus(`Palette "${name}" saved`, 'ok');
      scheduleRebuild();
      buildLegend();
    });
  }
}

function setStatus(msg: string, cls: string) {
  const el = document.getElementById('status-line');
  if (!el) return;
  el.textContent = msg;
  el.className = cls || '';
}
