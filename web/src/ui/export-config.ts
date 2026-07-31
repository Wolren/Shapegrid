// ══════════════════════════════════════════════════════════════════════════════
// Export Config JSON — full app state round-trip (v3)
// Extracted from app.ts (file-size governance)
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { listDashboardLayouts } from './dashboard';

export function exportConfig() {
  // Export settings live in the Export tab's inputs
  const expW = +(document.getElementById('inp-export-w') as HTMLInputElement)?.value || 1920;
  const expH = +(document.getElementById('inp-export-h') as HTMLInputElement)?.value || 1080;
  const expAutocrop = (document.getElementById('inp-export-autocrop') as HTMLInputElement)?.checked ?? true;
  const expVertical = (document.getElementById('inp-export-vertical') as HTMLInputElement)?.checked ?? false;
  const expPad = +(document.getElementById('inp-export-pad') as HTMLInputElement)?.value || 40;
  const expTitle = ((document.getElementById('inp-export-title') as HTMLInputElement)?.value || '').trim();
  const expFormat = (document.getElementById('inp-export-format') as HTMLSelectElement)?.value || 'png';
  const expScale = parseFloat((document.getElementById('inp-export-scale') as HTMLSelectElement)?.value) || 1;

  const config = {
    version: 3,
    generated: new Date().toISOString(),
    username: state.contributions?.username || '',
    totalContributions: state.contributions?.total || 0,
    boundary: state.poly,
    geoBounds: state.geoBounds || undefined,
    coordSystem: state.coordSystem || undefined,
    grid: state.grid ? {
      type: state.grid.gridType,
      count: state.count,
      cellSize: state.grid.cellSize,
      cells: state.grid.cells.map((c, i) => ({
        cx: c.cx, cy: c.cy,
        date: state.cellData[i]?.date || '',
        count: state.cellData[i]?.count || 0,
        intensity: state.cellData[i]?.intensity || 0,
      })),
    } : null,
    config: {
      camera: { yaw: state.yaw, pitch: state.pitch, zoom: state.zoom },
      render: {
        heightScale: state.heightScale,
        showBoundary: state.showBoundary,
        background: state.background,
        gap: state.gap,
        gridType: state.gridType,
        coverage: state.coverage,
        scaleMode: state.scaleMode,
        showCoordAxes: state.showCoordAxes,
        coordAxesScale: state.coordAxesScale,
        coordAxesPosition: state.coordAxesPosition,
        coordAxesXOffset: state.coordAxesXOffset,
        coordAxesYOffset: state.coordAxesYOffset,
        coordAxesTickLength: state.coordAxesTickLength,
        coordAxesLabelOffset: state.coordAxesLabelOffset,
        coordAxesLineColor: state.coordAxesLineColor,
        coordAxesLabelColor: state.coordAxesLabelColor,
      },
      effects: {
        bloomEnabled: state.bloomEnabled,
        bloomStrength: state.bloomStrength,
        bloomRadius: state.bloomRadius,
        bloomThreshold: state.bloomThreshold,
        fogEnabled: state.fogEnabled,
        fogDensity: state.fogDensity,
        toneMapping: state.toneMapping,
        envMapEnabled: state.envMapEnabled,
        rayTracingEnabled: state.rayTracingEnabled,
        rayTracingSamples: state.rayTracingSamples,
        rayTracingBounces: state.rayTracingBounces,
      },
      theme: { palette: state.palette, colors: state.theme },
      data: {
        daysMode: state.daysMode,
        selectedYears: [...state.selectedYears],
        orgName: state.orgName,
        includeOrgRepos: state.includeOrgRepos,
      },
      boundary: {
        type: state.boundaryType,
        preset: state.preset,
        country: state.country,
      },
      export: {
        width: expW, height: expH, autocrop: expAutocrop, vertical: expVertical,
        pad: expPad, title: expTitle, format: expFormat, scale: expScale,
      },
      dashboard: {
        widgets: state.dashboard.widgets,
        collapsed: state.dashboard.collapsed,
        layout: state.dashboard.layout,
      },
      layouts: listDashboardLayouts(),
      overlay: {
        legendPos: state.overlay.legendPos,
        statsPos: state.overlay.statsPos,
        showLegend: state.overlay.showLegend,
        showStats: state.overlay.showStats,
        legendFontSize: state.overlay.legendFontSize,
        legendBarWidth: state.overlay.legendBarWidth,
        statsFontSize: state.overlay.statsFontSize,
        statsInline: state.overlay.statsInline,
      },
    },
  };

  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `shapegrid-config-${Date.now()}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════════════════════════════
// UI Wiring
// ══════════════════════════════════════════════════════════════════════════════

