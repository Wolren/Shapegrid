// ══════════════════════════════════════════════════════════════════════════════
// Widget metadata - settings definitions for all 15 widgets
// Extracted from widget-manager.ts (file-size governance)
// ══════════════════════════════════════════════════════════════════════════════

import type { WidgetConfig, WidgetId } from '../types';

export interface WidgetSettingDef {
  key: string;
  label: string;
  type: 'range' | 'checkbox' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

export interface WidgetMeta {
  id: WidgetId;
  title: string;
  settings: WidgetSettingDef[];
}

export const WIDGET_META: WidgetMeta[] = [
  {
    id: 'legend',
    title: 'Legend',
    settings: [
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'stats',
    title: 'Statistics',
    settings: [
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'distribution',
    title: 'Distribution',
    settings: [
      { key: 'bins', label: 'Number of bins', type: 'range', min: 3, max: 20, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'timeline',
    title: 'Timeline',
    settings: [
      { key: 'days', label: 'Days shown', type: 'range', min: 14, max: 365, step: 7 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'activity',
    title: 'Activity',
    settings: [
      { key: 'days', label: 'Days shown', type: 'range', min: 14, max: 182, step: 7 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'topCells',
    title: 'Top Cells',
    settings: [
      { key: 'maxItems', label: 'Max items', type: 'range', min: 3, max: 12, step: 1 },
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'languages',
    title: 'Languages',
    settings: [
      { key: 'maxItems', label: 'Max items', type: 'range', min: 1, max: 20, step: 1 },
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'cellInfo',
    title: 'Cell Info',
    settings: [
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'scaleBar',
    title: 'Scale',
    settings: [
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'coordinates',
    title: 'Coordinates',
    settings: [
      { key: 'decimals', label: 'Decimals', type: 'range', min: 0, max: 6, step: 1 },
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'weekday',
    title: 'Weekday',
    settings: [
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'locked', label: 'Locked', type: 'checkbox' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'streak',
    title: 'Streak',
    settings: [
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
    ],
  },
  {
    id: 'monthly',
    title: 'Monthly',
    settings: [
      { key: 'height', label: 'Height', type: 'range', min: 90, max: 420, step: 10 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
    ],
  },
  {
    id: 'geo',
    title: 'Geo Info',
    settings: [
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 24, step: 1 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
    ],
  },
  {
    id: 'minimap',
    title: 'Mini Map',
    settings: [
      { key: 'height', label: 'Height', type: 'range', min: 90, max: 420, step: 10 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 2, step: 0.05 },
    ],
  },
];

export const POSITION_OPTIONS: { value: WidgetConfig['position']; label: string }[] = [
  { value: 'topLeft', label: 'Top Left' },
  { value: 'topRight', label: 'Top Right' },
  { value: 'bottomLeft', label: 'Bottom Left' },
  { value: 'bottomRight', label: 'Bottom Right' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

