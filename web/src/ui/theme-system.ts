// ══════════════════════════════════════════════════════════════════════════════
// Theme system — editor theme presets, widget color themes, pickers, CSS vars
// Extracted from app.ts (file-size governance)
// ══════════════════════════════════════════════════════════════════════════════

import { state, updateState } from './state';
import { renderAllWidgets, getWidgetSetting, setWidgetSetting, DEFAULT_WIDGET_PALETTES, type WidgetPalette } from './dashboard';
import { createColorPicker, type ColorPicker } from './color-picker';
import { listWidgetMeta } from './widget-manager';
import type { ThemeColors } from '../types';

const THEME_KEYS: { key: keyof ThemeColors; id: string }[] = [
  { key: 'accent', id: 'inp-theme-accent' },
  { key: 'accent2', id: 'inp-theme-accent2' },
  { key: 'background', id: 'inp-theme-background' },
  { key: 'surface', id: 'inp-theme-surface' },
  { key: 'surface2', id: 'inp-theme-surface2' },
  { key: 'surface3', id: 'inp-theme-surface3' },
  { key: 'border', id: 'inp-theme-border' },
  { key: 'text', id: 'inp-theme-text' },
  { key: 'muted', id: 'inp-theme-muted' },
];

const THEME_VAR_MAP: Record<keyof ThemeColors, string> = {
  accent: '--accent',
  accent2: '--accent2',
  background: '--bg',
  surface: '--surface',
  surface2: '--surface2',
  surface3: '--surface3',
  border: '--border',
  text: '--text',
  muted: '--muted',
};

const DEFAULT_THEME: ThemeColors = {
  accent: '#39d353',
  accent2: '#1f6feb',
  background: '#080c10',
  surface: '#0d1117',
  surface2: '#161b22',
  surface3: '#21262d',
  border: '#30363d',
  text: '#e6edf3',
  muted: '#8b949e',
};

// One-click theme presets for the Editor Colors section. Every theme defines
// the full 9-color set: accent, accent2, background, surface, surface2,
// surface3, border, text, muted.
const THEME_PRESETS: { name: string; theme: ThemeColors }[] = [
  { name: 'GitHub', theme: DEFAULT_THEME },
  {
    name: 'Forest',
    theme: {
      accent: '#58d68d', accent2: '#2e86c1',
      background: '#0a0f0d', surface: '#0f1613', surface2: '#182420', surface3: '#24362e',
      border: '#2f4a3e', text: '#e8f5e9', muted: '#8fae9e',
    },
  },
  {
    name: 'Ocean',
    theme: {
      accent: '#38bdf8', accent2: '#6366f1',
      background: '#060b13', surface: '#0b1220', surface2: '#131c2e', surface3: '#1e2a40',
      border: '#2b3a56', text: '#e2e8f0', muted: '#7f8ea3',
    },
  },
  {
    name: 'Sunset',
    theme: {
      accent: '#fb923c', accent2: '#e879f9',
      background: '#120a08', surface: '#1a0f0b', surface2: '#2a1710', surface3: '#3d2318',
      border: '#52301f', text: '#fdeee3', muted: '#c2a394',
    },
  },
  {
    name: 'Mono',
    theme: {
      accent: '#c9d1d9', accent2: '#8b949e',
      background: '#0a0a0a', surface: '#101010', surface2: '#181818', surface3: '#242424',
      border: '#333333', text: '#f0f0f0', muted: '#9a9a9a',
    },
  },
  {
    name: 'Midnight',
    theme: {
      accent: '#a78bfa', accent2: '#818cf8',
      background: '#07070f', surface: '#0d0d1a', surface2: '#151528', surface3: '#1f1f38',
      border: '#2e2e4d', text: '#e5e7ff', muted: '#8d8db3',
    },
  },
  {
    name: 'Aurora',
    theme: {
      accent: '#2dd4bf', accent2: '#34d399',
      background: '#04100d', surface: '#071713', surface2: '#0d241e', surface3: '#17352c',
      border: '#23503f', text: '#dcfce7', muted: '#7fb8a5',
    },
  },
  {
    name: 'Cherry',
    theme: {
      accent: '#f87171', accent2: '#fb7185',
      background: '#120606', surface: '#1c0a0a', surface2: '#2b1111', surface3: '#3f1a1a',
      border: '#5c2626', text: '#ffe4e4', muted: '#c98f8f',
    },
  },
  {
    name: 'Amber',
    theme: {
      accent: '#fbbf24', accent2: '#f59e0b',
      background: '#120b02', surface: '#1a1206', surface2: '#271b0a', surface3: '#392813',
      border: '#53391a', text: '#fef3c7', muted: '#c9a76b',
    },
  },
  {
    name: 'Cyber',
    theme: {
      accent: '#22d3ee', accent2: '#e879f9',
      background: '#04040d', surface: '#0a0a18', surface2: '#111129', surface3: '#1c1c3d',
      border: '#2c2c55', text: '#d9f4ff', muted: '#8fa3c9',
    },
  },
  {
    name: 'Slate',
    theme: {
      accent: '#60a5fa', accent2: '#94a3b8',
      background: '#0a0e14', surface: '#0f141c', surface2: '#161d28', surface3: '#202936',
      border: '#2d3947', text: '#e2e8f0', muted: '#7c8aa0',
    },
  },
  {
    name: 'Ember',
    theme: {
      accent: '#ff6b35', accent2: '#ffb703',
      background: '#150a04', surface: '#1f0f06', surface2: '#2e1608', surface3: '#42200b',
      border: '#5c2e10', text: '#ffe8d6', muted: '#c9a184',
    },
  },
];

// Widget themes: one coherent single-hue family per theme (accent +
// secondary per widget, varying only in lightness so widgets stay
// distinguishable). 'Default' clears all overrides so every widget uses
// its built-in default palette.
const WIDGET_THEMES: { name: string; palettes: Record<string, WidgetPalette> }[] = [
  { name: 'Default', palettes: {} },
  {
    name: 'Neon',
    palettes: {
      legend:       { accent: '#a3e635', secondary: '#4d7c0f' },
      stats:        { accent: '#bef264', secondary: '#65a30d' },
      languages:    { accent: '#84cc16', secondary: '#4d7c0f' },
      cellInfo:     { accent: '#d9f99d', secondary: '#65a30d' },
      scaleBar:     { accent: '#a3e635', secondary: '#4d7c0f' },
      coordinates:  { accent: '#9ca3af', secondary: '#6b7280' },
      distribution: { accent: '#a3e635', secondary: '#4d7c0f' },
      timeline:     { accent: '#bef264', secondary: '#65a30d' },
      activity:     { accent: '#84cc16', secondary: '#4d7c0f' },
      topCells:     { accent: '#d9f99d', secondary: '#65a30d' },
      weekday:      { accent: '#a3e635', secondary: '#4d7c0f' },
      streak:       { accent: '#bef264', secondary: '#65a30d' },
      monthly:      { accent: '#84cc16', secondary: '#4d7c0f' },
      geo:          { accent: '#a3e635', secondary: '#4d7c0f' },
      minimap:      { accent: '#a3e635', secondary: '#4d7c0f' },
    },
  },
  {
    name: 'Cool',
    palettes: {
      legend:       { accent: '#2dd4bf', secondary: '#0f766e' },
      stats:        { accent: '#22d3ee', secondary: '#0891b2' },
      languages:    { accent: '#2dd4bf', secondary: '#0f766e' },
      cellInfo:     { accent: '#67e8f9', secondary: '#0e7490' },
      scaleBar:     { accent: '#2dd4bf', secondary: '#0f766e' },
      coordinates:  { accent: '#94a3b8', secondary: '#64748b' },
      distribution: { accent: '#22d3ee', secondary: '#0891b2' },
      timeline:     { accent: '#2dd4bf', secondary: '#0f766e' },
      activity:     { accent: '#67e8f9', secondary: '#0e7490' },
      topCells:     { accent: '#22d3ee', secondary: '#0891b2' },
      weekday:      { accent: '#2dd4bf', secondary: '#0f766e' },
      streak:       { accent: '#22d3ee', secondary: '#0891b2' },
      monthly:      { accent: '#2dd4bf', secondary: '#0f766e' },
      geo:          { accent: '#67e8f9', secondary: '#0e7490' },
      minimap:      { accent: '#2dd4bf', secondary: '#0f766e' },
    },
  },
  {
    name: 'Warm',
    palettes: {
      legend:       { accent: '#fbbf24', secondary: '#b45309' },
      stats:        { accent: '#f59e0b', secondary: '#b45309' },
      languages:    { accent: '#fbbf24', secondary: '#92400e' },
      cellInfo:     { accent: '#fcd34d', secondary: '#b45309' },
      scaleBar:     { accent: '#fbbf24', secondary: '#b45309' },
      coordinates:  { accent: '#a8a29e', secondary: '#78716c' },
      distribution: { accent: '#fb923c', secondary: '#c2410c' },
      timeline:     { accent: '#f59e0b', secondary: '#b45309' },
      activity:     { accent: '#fbbf24', secondary: '#b45309' },
      topCells:     { accent: '#fcd34d', secondary: '#b45309' },
      weekday:      { accent: '#fbbf24', secondary: '#b45309' },
      streak:       { accent: '#fb923c', secondary: '#c2410c' },
      monthly:      { accent: '#f59e0b', secondary: '#b45309' },
      geo:          { accent: '#fbbf24', secondary: '#b45309' },
      minimap:      { accent: '#fbbf24', secondary: '#b45309' },
    },
  },
  {
    name: 'Pastel',
    palettes: {
      legend:       { accent: '#c4b5fd', secondary: '#8b5cf6' },
      stats:        { accent: '#a78bfa', secondary: '#7c3aed' },
      languages:    { accent: '#b39ddb', secondary: '#8b5cf6' },
      cellInfo:     { accent: '#d8b4fe', secondary: '#9333ea' },
      scaleBar:     { accent: '#c4b5fd', secondary: '#8b5cf6' },
      coordinates:  { accent: '#cbd5e1', secondary: '#94a3b8' },
      distribution: { accent: '#b39ddb', secondary: '#7c3aed' },
      timeline:     { accent: '#a78bfa', secondary: '#7c3aed' },
      activity:     { accent: '#c4b5fd', secondary: '#8b5cf6' },
      topCells:     { accent: '#d8b4fe', secondary: '#9333ea' },
      weekday:      { accent: '#c4b5fd', secondary: '#8b5cf6' },
      streak:       { accent: '#b39ddb', secondary: '#7c3aed' },
      monthly:      { accent: '#a78bfa', secondary: '#7c3aed' },
      geo:          { accent: '#c4b5fd', secondary: '#8b5cf6' },
      minimap:      { accent: '#c4b5fd', secondary: '#8b5cf6' },
    },
  },
  {
    name: 'Forest',
    palettes: {
      legend:       { accent: '#4ade80', secondary: '#166534' },
      stats:        { accent: '#34d399', secondary: '#047857' },
      languages:    { accent: '#2dd4bf', secondary: '#0f766e' },
      cellInfo:     { accent: '#86efac', secondary: '#16a34a' },
      scaleBar:     { accent: '#4ade80', secondary: '#166534' },
      coordinates:  { accent: '#a3a3a3', secondary: '#737373' },
      distribution: { accent: '#34d399', secondary: '#047857' },
      timeline:     { accent: '#2dd4bf', secondary: '#0f766e' },
      activity:     { accent: '#22c55e', secondary: '#15803d' },
      topCells:     { accent: '#86efac', secondary: '#16a34a' },
      weekday:      { accent: '#4ade80', secondary: '#166534' },
      streak:       { accent: '#4ade80', secondary: '#166534' },
      monthly:      { accent: '#34d399', secondary: '#047857' },
      geo:          { accent: '#22c55e', secondary: '#15803d' },
      minimap:      { accent: '#4ade80', secondary: '#166534' },
    },
  },
  {
    name: 'Ocean',
    palettes: {
      legend:       { accent: '#38bdf8', secondary: '#0369a1' },
      stats:        { accent: '#60a5fa', secondary: '#1d4ed8' },
      languages:    { accent: '#3b82f6', secondary: '#1d4ed8' },
      cellInfo:     { accent: '#818cf8', secondary: '#4338ca' },
      scaleBar:     { accent: '#38bdf8', secondary: '#0369a1' },
      coordinates:  { accent: '#94a3b8', secondary: '#64748b' },
      distribution: { accent: '#60a5fa', secondary: '#1d4ed8' },
      timeline:     { accent: '#3b82f6', secondary: '#1d4ed8' },
      activity:     { accent: '#818cf8', secondary: '#4338ca' },
      topCells:     { accent: '#60a5fa', secondary: '#1d4ed8' },
      weekday:      { accent: '#38bdf8', secondary: '#0369a1' },
      streak:       { accent: '#60a5fa', secondary: '#1d4ed8' },
      monthly:      { accent: '#3b82f6', secondary: '#1d4ed8' },
      geo:          { accent: '#818cf8', secondary: '#4338ca' },
      minimap:      { accent: '#38bdf8', secondary: '#0369a1' },
    },
  },
  {
    name: 'Sunset',
    palettes: {
      legend:       { accent: '#fb923c', secondary: '#c2410c' },
      stats:        { accent: '#f87171', secondary: '#b91c1c' },
      languages:    { accent: '#fb923c', secondary: '#c2410c' },
      cellInfo:     { accent: '#fb7185', secondary: '#be123c' },
      scaleBar:     { accent: '#fb923c', secondary: '#c2410c' },
      coordinates:  { accent: '#a8a29e', secondary: '#78716c' },
      distribution: { accent: '#f87171', secondary: '#b91c1c' },
      timeline:     { accent: '#f472b6', secondary: '#be185d' },
      activity:     { accent: '#fb7185', secondary: '#be123c' },
      topCells:     { accent: '#f87171', secondary: '#b91c1c' },
      weekday:      { accent: '#fb923c', secondary: '#c2410c' },
      streak:       { accent: '#f87171', secondary: '#b91c1c' },
      monthly:      { accent: '#f472b6', secondary: '#be185d' },
      geo:          { accent: '#fb7185', secondary: '#be123c' },
      minimap:      { accent: '#fb923c', secondary: '#c2410c' },
    },
  },
  {
    name: 'Mono',
    palettes: {
      legend:       { accent: '#c9d1d9', secondary: '#8b949e' },
      stats:        { accent: '#e6edf3', secondary: '#8b949e' },
      languages:    { accent: '#d0d7de', secondary: '#6e7681' },
      cellInfo:     { accent: '#c9d1d9', secondary: '#6e7681' },
      scaleBar:     { accent: '#c9d1d9', secondary: '#8b949e' },
      coordinates:  { accent: '#9da7b3', secondary: '#6e7681' },
      distribution: { accent: '#b6c2cf', secondary: '#6e7681' },
      timeline:     { accent: '#e6edf3', secondary: '#8b949e' },
      activity:     { accent: '#c9d1d9', secondary: '#6e7681' },
      topCells:     { accent: '#d0d7de', secondary: '#6e7681' },
      weekday:      { accent: '#c9d1d9', secondary: '#8b949e' },
      streak:       { accent: '#e6edf3', secondary: '#8b949e' },
      monthly:      { accent: '#d0d7de', secondary: '#6e7681' },
      geo:          { accent: '#c9d1d9', secondary: '#6e7681' },
      minimap:      { accent: '#c9d1d9', secondary: '#8b949e' },
    },
  },
  {
    name: 'Cyber',
    palettes: {
      legend:       { accent: '#e879f9', secondary: '#a21caf' },
      stats:        { accent: '#d946ef', secondary: '#a21caf' },
      languages:    { accent: '#c026d3', secondary: '#86198f' },
      cellInfo:     { accent: '#f0abfc', secondary: '#a21caf' },
      scaleBar:     { accent: '#e879f9', secondary: '#a21caf' },
      coordinates:  { accent: '#8fa3c9', secondary: '#64748b' },
      distribution: { accent: '#d946ef', secondary: '#a21caf' },
      timeline:     { accent: '#c026d3', secondary: '#86198f' },
      activity:     { accent: '#e879f9', secondary: '#a21caf' },
      topCells:     { accent: '#f0abfc', secondary: '#a21caf' },
      weekday:      { accent: '#e879f9', secondary: '#a21caf' },
      streak:       { accent: '#d946ef', secondary: '#a21caf' },
      monthly:      { accent: '#c026d3', secondary: '#86198f' },
      geo:          { accent: '#e879f9', secondary: '#a21caf' },
      minimap:      { accent: '#e879f9', secondary: '#a21caf' },
    },
  },
];

/**
 * Widget Colors section (Theme tab): widget theme bar + accent/secondary
 * pickers per widget, fully independent from the editor theme.
 */
interface WidgetPickerSet {
  accent: ColorPicker;
  secondary: ColorPicker;
}

const widgetColorPickers: Record<string, WidgetPickerSet> = {};

export function initThemeWidgetColors(): void {
  const host = document.getElementById('theme-widget-colors');
  if (!host) return;

  // Widget theme selector bar
  const bar = document.createElement('div');
  bar.className = 'widget-theme-bar';
  for (const wt of WIDGET_THEMES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'widget-theme-btn';
    btn.textContent = wt.name;
    btn.title = `Apply the ${wt.name} widget palette`;
    btn.addEventListener('click', () => {
      for (const { id } of listWidgetMeta()) {
        const pal = wt.palettes[id];
        setWidgetSetting(id, 'accent', pal?.accent ?? '');
        setWidgetSetting(id, 'secondary', pal?.secondary ?? '');
        widgetColorPickers[id]?.accent.setValue(pal?.accent ?? DEFAULT_WIDGET_PALETTES[id].accent);
        widgetColorPickers[id]?.secondary.setValue(pal?.secondary ?? DEFAULT_WIDGET_PALETTES[id].secondary);
      }
      renderAllWidgets();
    });
    bar.appendChild(btn);
  }
  host.appendChild(bar);

  // Per-widget accent + secondary rows
  for (const { id, title } of listWidgetMeta()) {
    const row = document.createElement('div');
    row.className = 'theme-row widget-color-row';

    const label = document.createElement('label');
    label.textContent = title;
    label.title = title;
    row.appendChild(label);

    const makePicker = (key: 'accent' | 'secondary'): ColorPicker => {
      const get = (): string =>
        (getWidgetSetting(id, key, '') as string) || DEFAULT_WIDGET_PALETTES[id][key];
      const picker = createColorPicker({
        value: get(),
        onChange: (hex) => {
          setWidgetSetting(id, key, hex.toLowerCase());
          renderAllWidgets();
        },
        onCommit: (hex) => {
          setWidgetSetting(id, key, hex.toLowerCase());
          renderAllWidgets();
        },
        resetLabel: 'theme',
        onReset: () => {
          setWidgetSetting(id, key, '');
          picker.setValue(DEFAULT_WIDGET_PALETTES[id][key]);
          renderAllWidgets();
        },
      }, row);
      return picker;
    };

    widgetColorPickers[id] = {
      accent: makePicker('accent'),
      secondary: makePicker('secondary'),
    };

    host.appendChild(row);
  }
}

const themeCards: Record<string, HTMLElement> = {};

function setActiveThemeCard(name: string): void {
  for (const [n, el] of Object.entries(themeCards)) {
    el.classList.toggle('active', n === name);
  }
}

export function initThemePresets(): void {
  const host = document.getElementById('theme-presets');
  if (!host) return;
  for (const preset of THEME_PRESETS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'theme-card';
    card.title = `Apply the ${preset.name} theme`;

    const name = document.createElement('div');
    name.className = 'theme-card-name';
    name.textContent = preset.name;

    const strip = document.createElement('div');
    strip.className = 'theme-card-strip';
    const preview = [
      preset.theme.accent, preset.theme.accent2, preset.theme.background,
      preset.theme.surface2, preset.theme.surface3, preset.theme.border, preset.theme.text,
    ];
    for (const color of preview) {
      const chip = document.createElement('span');
      chip.className = 'theme-card-chip';
      chip.style.background = color;
      strip.appendChild(chip);
    }

    card.appendChild(name);
    card.appendChild(strip);
    card.addEventListener('click', () => {
      updateState('theme', { ...preset.theme });
      applyTheme();
      syncThemeInputs();
      renderAllWidgets();
      setActiveThemeCard(preset.name);
    });
    host.appendChild(card);
    themeCards[preset.name] = card;
  }
  setActiveThemeCard('GitHub');
}

const themePickers: Partial<Record<keyof ThemeColors, ColorPicker>> = {};

/** Apply the current theme to the CSS custom properties (live site-wide). */
export function applyTheme(): void {
  const root = document.documentElement;
  for (const { key } of THEME_KEYS) {
    root.style.setProperty(THEME_VAR_MAP[key], state.theme[key]);
  }
}

export function syncThemeInputs(): void {
  for (const { key, id } of THEME_KEYS) {
    const picker = themePickers[key];
    if (picker) picker.setValue(state.theme[key]);
    const hex = document.getElementById(`${id}-hex`) as HTMLInputElement | null;
    if (hex) hex.value = state.theme[key];
  }
}

export function initThemeControls(): void {
  for (const { key, id } of THEME_KEYS) {
    const host = document.getElementById(id) as HTMLInputElement | null;
    const hex = document.getElementById(`${id}-hex`) as HTMLInputElement | null;
    if (!host) continue;
    const apply = (v: string): void => {
      if (!/^#([0-9a-f]{6})$/i.test(v)) return;
      updateState('theme', { ...state.theme, [key]: v.toLowerCase() });
      applyTheme();
      renderAllWidgets(); // widgets fall back to the theme accent
    };
    // Replace the native color input with the swatch + popover picker
    const picker = createColorPicker({
      value: state.theme[key],
      onChange: (v) => {
        if (hex) hex.value = v;
        apply(v);
      },
      onCommit: apply,
    }, null, host);
    themePickers[key] = picker;
    hex?.addEventListener('change', () => {
      const v = hex.value.trim();
      if (/^#([0-9a-f]{6})$/i.test(v)) picker.setValue(v.toLowerCase());
      apply(v);
    });
  }
  const resetBtn = document.getElementById('btn-theme-reset');
  resetBtn?.addEventListener('click', () => {
    updateState('theme', { ...DEFAULT_THEME });
    applyTheme();
    syncThemeInputs();
    renderAllWidgets();
    setActiveThemeCard('GitHub');
  });
}

// Load Config button - import an exported config JSON via loadFromJson()
