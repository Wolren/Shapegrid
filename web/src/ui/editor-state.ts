// ══════════════════════════════════════════════════════════════════════════════
// Editor state management - tool selection, measurements, selections
// ══════════════════════════════════════════════════════════════════════════════

import type { EditorState, ToolType, LayerVisibility } from '../types';

export const defaultLayerVisibility: LayerVisibility = {
  boundary: true,
  grid: true,
  axes: true,
  overheadLabels: true,
};

export const defaultEditorState: EditorState = {
  activeTool: 'select',
  selectedCellIndices: [],
  measurements: [],
  activeMeasurement: null,
  showInfoPanel: true,
  showDataTable: false,
  showLayerPanel: true,
  dataTableSort: null,
  layerVisibility: { ...defaultLayerVisibility },
};

let _editor: EditorState = { ...defaultEditorState };

export function getEditor(): EditorState {
  return _editor;
}

export function setEditor(partial: Partial<EditorState>): void {
  Object.assign(_editor, partial);
}

export function setActiveTool(tool: ToolType): void {
  _editor.activeTool = tool;
  // Clear selection when switching away from select
  if (tool !== 'select') {
    _editor.selectedCellIndices = [];
  }
}

export function toggleDataTable(): void {
  _editor.showDataTable = !_editor.showDataTable;
}

export function toggleInfoPanel(): void {
  _editor.showInfoPanel = !_editor.showInfoPanel;
}

export function toggleLayerPanel(): void {
  _editor.showLayerPanel = !_editor.showLayerPanel;
}

export function setLayerVisible(key: keyof LayerVisibility, visible: boolean): void {
  _editor.layerVisibility[key] = visible;
}

export function toggleLayer(key: keyof LayerVisibility): void {
  _editor.layerVisibility[key] = !_editor.layerVisibility[key];
}

let measureCounter = 0;

export function startMeasurement(type: 'distance' | 'area'): void {
  const id = `m_${Date.now()}_${measureCounter++}`;
  _editor.activeMeasurement = {
    id,
    type,
    points: [],
    label: type === 'distance' ? 'Distance' : 'Area',
  };
}

export function addMeasurementPoint(x: number, y: number): void {
  const m = _editor.activeMeasurement;
  if (!m) return;
  m.points.push([x, y]);
  if (m.type === 'distance' && m.points.length >= 2) {
    // Recalculate total polyline distance
    let total = 0;
    for (let i = 1; i < m.points.length; i++) {
      const dx = m.points[i][0] - m.points[i - 1][0];
      const dy = m.points[i][1] - m.points[i - 1][1];
      total += Math.sqrt(dx * dx + dy * dy);
    }
    m.distance = total;
  }
  if (m.type === 'area' && m.points.length >= 3) {
    // Shoelace formula
    let area = 0;
    const n = m.points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += m.points[i][0] * m.points[j][1];
      area -= m.points[j][0] * m.points[i][1];
    }
    m.area = Math.abs(area) / 2;
  }
}

export function finishMeasurement(): void {
  const m = _editor.activeMeasurement;
  if (!m) return;
  if (m.points.length >= 2) {
    _editor.measurements.push({ ...m, points: [...m.points] });
  }
  _editor.activeMeasurement = null;
}

export function cancelMeasurement(): void {
  _editor.activeMeasurement = null;
}

export function clearMeasurements(): void {
  _editor.measurements = [];
  _editor.activeMeasurement = null;
}

export function setSelectedCells(indices: number[]): void {
  _editor.selectedCellIndices = indices;
}
