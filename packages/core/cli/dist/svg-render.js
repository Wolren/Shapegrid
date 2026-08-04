// ══════════════════════════════════════════════════════════════════════════════
// SVG renderer - server-side SVG generation, legend, coordinate axes, colors
// Extracted from index.ts (file-size governance)
// ══════════════════════════════════════════════════════════════════════════════
import { intensityToColor } from '@shapegrid/core';
import { renderDashboardWidgets } from './svg-widgets.js';
/** Unit vectors for the 6 pointy-top hex corners (angles -30..270 deg).
 *  Hoisted: per-cell corner offsets are then a multiply, not a cos/sin. */
const HEX_CORNER_DIRS = Array.from({ length: 6 }, (_, i) => {
    const a = ((i * 60 - 30) * Math.PI) / 180;
    return [Math.cos(a), Math.sin(a)];
});
export function generateSvg(data, cfg) {
    const W = cfg.output.width ?? 1200;
    const H = cfg.output.height ?? 630;
    // Use theme.palette if available, fallback to render.colorScale
    const colorScale = (cfg.theme?.palette || cfg.render.colorScale || 'github');
    const heightScale = cfg.render.heightScale ?? 1;
    const gap = cfg.render.gap ?? 0.08;
    const bgColor = cfg.render.background ?? '';
    const zoom = cfg.camera.zoom ?? 1.0; // 1.0 = normal, <1 = zoomed in, >1 = zoomed out
    // If dayBorder is set, empty days render as a subtle outline (translucent fill)
    const dayBorder = cfg.theme?.dayBorder ?? '';
    // Intensity scale mode mirrors the web viewer (scene.ts scaleIntensity): the
    // transform is applied to BOTH extrusion height and colour ramp so tall
    // outliers don't dominate the visual field (e.g. cbrt tames a 241-day spike).
    const scaleMode = cfg.render.scaleMode ?? 'linear';
    const scaleIntensity = (raw) => {
        const clamped = Math.max(0, Math.min(1, raw));
        if (scaleMode === 'sqrt')
            return Math.sqrt(clamped);
        if (scaleMode === 'cbrt')
            return Math.cbrt(clamped);
        if (scaleMode === 'log')
            return clamped <= 0 ? 0 : Math.log(1 + clamped * 9) / Math.log(10);
        return clamped;
    };
    // Camera parameters mirror the web viewer (scene.ts): orthographic
    // camera with frustum size fs = state.zoom, aspect W/H, positioned at
    // dist = 2.5 along the yaw/pitch direction, looking at the origin.
    const CAM_DIST = 2.5;
    const ISO_YAW = (cfg.camera.yaw ?? 30) * Math.PI / 180;
    const ISO_PITCH = (cfg.camera.pitch ?? 45) * Math.PI / 180;
    const fs = zoom; // frustum height in world units
    const asp = W / H;
    // Camera eye position (matches scene.ts posCamera)
    const eyeX = CAM_DIST * Math.sin(ISO_YAW) * Math.cos(ISO_PITCH);
    const eyeY = CAM_DIST * Math.sin(ISO_PITCH);
    const eyeZ = CAM_DIST * Math.cos(ISO_YAW) * Math.cos(ISO_PITCH);
    // View basis: forward f = normalize(center - eye), side s = normalize(cross(f, up)),
    // up u = cross(s, f). Replicates THREE.lookAt with up = (0,1,0).
    const fLen = Math.sqrt(eyeX * eyeX + eyeY * eyeY + eyeZ * eyeZ);
    const fX = -eyeX / fLen, fY = -eyeY / fLen, fZ = -eyeZ / fLen;
    const sX = -fZ, sY = 0, sZ = fX; // cross(f, (0,1,0)) = (-f.z, 0, f.x)
    const sLen = Math.sqrt(sX * sX + sZ * sZ);
    const sNX = sX / sLen, sNZ = sZ / sLen; // normalized side
    // u = cross(s, f): u.x = s.y*f.z - s.z*f.y, u.y = s.z*f.x - s.x*f.z, u.z = s.x*f.y - s.y*f.x
    const uX = -sNZ * fY, uY = sNZ * fX - sNX * fZ, uZ = sNX * fY;
    // Ortho frustum: left=-fs*asp/2, right=fs*asp/2, top=fs/2, bottom=-fs/2.
    // Screen: sx = (vx/(fs*asp/2)+1)/2*W, sy = (1 - vy/(fs/2))/2*H.
    const toScreen = (wx, wy, wz) => {
        const dx = wx - eyeX, dy = wy - eyeY, dz = wz - eyeZ;
        const vx = dx * sNX + dz * sNZ;
        const vy = dx * uX + dy * uY + dz * uZ;
        return [((vx / (fs * asp / 2)) + 1) / 2 * W, (1 - vy / (fs / 2)) / 2 * H];
    };
    // Calculate grid bounds to center properly
    const cells = data.grid.cells;
    if (cells.length === 0) {
        throw new Error('Cannot render SVG: grid has no cells');
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const cell of cells) {
        if (cell.cx < minX)
            minX = cell.cx;
        if (cell.cx > maxX)
            maxX = cell.cx;
        if (cell.cy < minY)
            minY = cell.cy;
        if (cell.cy > maxY)
            maxY = cell.cy;
    }
    const gridWidth = maxX - minX;
    const gridHeight = maxY - minY;
    // Cell sizing
    const cellSize = data.grid.cellSize * (1 - gap);
    const halfSize = cellSize / 2;
    // Cell extrusion height mirrors the web viewer (scene.ts buildMesh):
    // h = max(0.008, scaled * heightScale * 0.12 + 0.008)
    const cellHeight = (scaled) => Math.max(0.008, scaled * heightScale * 0.12 + 0.008);
    // Project a world-space point (cells live at cx-0.5, cy-0.5 like the
    // webview, grid centred on the origin) through the ortho camera above.
    const projBase = (wx, wy, wz) => toScreen(wx, wy, wz);
    // Prepare cells with depth info (eye-weighted: draw farthest first)
    const cellRenderData = cells.map(cell => ({
        cx: cell.cx,
        cy: cell.cy,
        intensity: cell.intensity,
        count: cell.count,
        date: cell.date,
        depth: (cell.cx - 0.5) * eyeX + (cell.cy - 0.5) * eyeZ,
    }));
    // Sort by depth ascending (farthest from camera first)
    cellRenderData.sort((a, b) => a.depth - b.depth);
    // Shade cache: one darken/lighten pass per unique colour instead of per face.
    const colorCache = new Map();
    const paletteFor = (color) => {
        let p = colorCache.get(color);
        if (!p) {
            p = {
                top: color,
                sideLight: darkenColor(color, 0.78),
                sideDark: darkenColor(color, 0.55),
                floor: darkenColor(color, 0.4),
                stroke: lightenColor(color, 1.15),
            };
            colorCache.set(color, p);
        }
        return p;
    };
    // Generate 3D cell geometry
    function squareCorners(cell, wy) {
        // World coords match the webview: cells centred at (cx - 0.5, cy - 0.5).
        const wx = cell.cx - 0.5;
        const wz = cell.cy - 0.5;
        return [
            projBase(wx - halfSize, wy, wz - halfSize), // 0 TL
            projBase(wx + halfSize, wy, wz - halfSize), // 1 TR
            projBase(wx + halfSize, wy, wz + halfSize), // 2 BR
            projBase(wx - halfSize, wy, wz + halfSize), // 3 BL
        ];
    }
    function renderCell3D(cell) {
        const scaled = scaleIntensity(cell.intensity);
        const h = cellHeight(scaled);
        const pal = paletteFor(intensityToColor(scaled, colorScale));
        // Empty day with dayBorder set: flat subtle outline (translucent fill so the
        // grid still reads as a solid surface instead of punched-out holes).
        const isEmptyDay = cell.intensity === 0 && dayBorder;
        if (isEmptyDay) {
            if (data.grid.type === 'square') {
                const base = squareCorners(cell, 0);
                return `<g>
  <title>${cell.date}: ${cell.count} contributions</title>
  <polygon
    points="${polyPoints(base)}"
    fill="${dayBorder}"
    fill-opacity="0.06"
    stroke="${dayBorder}"
    stroke-width="0.8"
    stroke-linejoin="round"
  />
</g>`;
            }
            const base = hexProjected(cell, 0);
            return `<g>
  <title>${cell.date}: ${cell.count} contributions</title>
  <polygon
    points="${polyPoints(base)}"
    fill="${dayBorder}"
    fill-opacity="0.06"
    stroke="${dayBorder}"
    stroke-width="0.8"
    stroke-linejoin="round"
  />
</g>`;
        }
        if (data.grid.type === 'square') {
            const base = squareCorners(cell, 0);
            const top = squareCorners(cell, h);
            // Camera sits at +x/+y/+z: the visible side faces are +x (corners 1-2,
            // shadow) and +z (corners 2-3, lit by the (2,4,3) directional light).
            // Winding is ordered so the polygons render without self-intersection.
            return `<g>
  <title>${cell.date}: ${cell.count} contributions</title>
  <!-- Floor/base face (visible through transparent empty cells) -->
  <polygon
    points="${polyPoints(base)}"
    fill="${pal.floor}"
    stroke="${pal.floor}"
    stroke-width="0.35"
    stroke-linejoin="round"
  />
  <!-- +x face (shadow) -->
  <polygon
    points="${fmt(top[1])} ${fmt(base[1])} ${fmt(base[2])} ${fmt(top[2])}"
    fill="${pal.sideDark}"
    stroke="${pal.sideDark}"
    stroke-width="0.4"
    stroke-linejoin="round"
  />
  <!-- +z face (lit) -->
  <polygon
    points="${fmt(top[2])} ${fmt(base[2])} ${fmt(base[3])} ${fmt(top[3])}"
    fill="${pal.sideLight}"
    stroke="${pal.sideLight}"
    stroke-width="0.4"
    stroke-linejoin="round"
  />
  <!-- Top face -->
  <polygon
    points="${polyPoints(top)}"
    fill="${pal.top}"
    stroke="${pal.stroke}"
    stroke-width="0.6"
    stroke-linejoin="round"
  />
</g>`;
        }
        // Hexagonal cells: visible side faces are 0-1 (shadow), 1-2 (lit), 2-3 (shadow)
        // for a camera in the +x/+z quadrant.
        const hexBase = hexProjected(cell, 0);
        const hexTop = hexProjected(cell, h);
        return `<g>
  <title>${cell.date}: ${cell.count} contributions</title>
  <!-- Floor/base face (visible through transparent empty cells) -->
  <polygon
    points="${polyPoints(hexBase)}"
    fill="${pal.floor}"
    stroke="${pal.floor}"
    stroke-width="0.35"
    stroke-linejoin="round"
  />
  <!-- Side face 0-1 (shadow) -->
  <polygon
    points="${fmt(hexTop[0])} ${fmt(hexBase[0])} ${fmt(hexBase[1])} ${fmt(hexTop[1])}"
    fill="${pal.sideDark}"
    stroke="${pal.sideDark}"
    stroke-width="0.4"
    stroke-linejoin="round"
  />
  <!-- Side face 1-2 (lit) -->
  <polygon
    points="${fmt(hexTop[1])} ${fmt(hexBase[1])} ${fmt(hexBase[2])} ${fmt(hexTop[2])}"
    fill="${pal.sideLight}"
    stroke="${pal.sideLight}"
    stroke-width="0.4"
    stroke-linejoin="round"
  />
  <!-- Side face 2-3 (shadow) -->
  <polygon
    points="${fmt(hexTop[2])} ${fmt(hexBase[2])} ${fmt(hexBase[3])} ${fmt(hexTop[3])}"
    fill="${pal.sideDark}"
    stroke="${pal.sideDark}"
    stroke-width="0.4"
    stroke-linejoin="round"
  />
  <!-- Top face -->
  <polygon
    points="${polyPoints(hexTop)}"
    fill="${pal.top}"
    stroke="${pal.stroke}"
    stroke-width="0.6"
    stroke-linejoin="round"
  />
</g>`;
    }
    /** Project the 6 hex corners of a cell at height wy (camera-based). */
    function hexProjected(cell, wy) {
        const wx = cell.cx - 0.5;
        const wz = cell.cy - 0.5;
        const pts = new Array(6);
        for (let i = 0; i < 6; i++) {
            pts[i] = projBase(wx + HEX_CORNER_DIRS[i][0] * halfSize, wy, wz + HEX_CORNER_DIRS[i][1] * halfSize);
        }
        return pts;
    }
    // Build SVG content
    const cellsSvg = cellRenderData.map(renderCell3D).join('\n    ');
    // Legend gradient stops (shared defs, hoisted out of the legend group)
    const legendStops = Array.from({ length: 20 }, (_, i) => {
        const t = i / 19;
        return `<stop offset="${(t * 100).toFixed(0)}%" stop-color="${intensityToColor(t, colorScale)}"/>`;
    }).join('\n      ');
    // Dashboard overlay widgets (config-driven) - replaces the old hardcoded
    // legend when a dashboard section is present; falls back to the classic
    // legend so legacy configs keep rendering.
    const dashboardWidgets = renderDashboardWidgets(data, cfg.dashboard?.widgets, W, H);
    const legend = dashboardWidgets ? '' : generateLegend(colorScale, W, H);
    // Generate coordinate axes
    const coordAxes = generateCoordAxes(data, cfg, minX, maxX, minY, maxY, W, H, zoom, ISO_YAW, ISO_PITCH);
    // Title and metadata
    const titleY = 35;
    const subtitleY = 52;
    const footerY = H - 15;
    const totalContribs = data.totalContributions;
    const cellCount = data.grid.cells.length;
    const dateRange = getDateRange(data);
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <!-- Glow filter for title -->
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <!-- Soft drop shadow under the whole grid for depth -->
    <filter id="cell-shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="9" stdDeviation="11" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
    <linearGradient id="legend-grad" x1="0" y1="0" x2="1" y2="0">
      ${legendStops}
    </linearGradient>
  </defs>
${bgColor ? `
  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg-grad)"/>
  <defs>
    <linearGradient id="bg-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bgColor}"/>
      <stop offset="100%" stop-color="${darkenColor(bgColor, 0.85)}"/>
    </linearGradient>
  </defs>
` : ''}
  <!-- Title Section -->
  <g id="title" filter="url(#glow)">
    <text x="${W / 2}" y="${titleY}" text-anchor="middle" fill="#e6edf3" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600" letter-spacing="0.5">
      @${data.username}
    </text>
  </g>
  <text x="${W / 2}" y="${subtitleY}" text-anchor="middle" fill="#8b949e" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="300" letter-spacing="0.3">
    ${totalContribs} contributions · ${cellCount} days · ${dateRange}
  </text>
${coordAxes}
  <!-- Grid Cells -->
  <g id="cells" shape-rendering="geometricPrecision" filter="url(#cell-shadow)">
    ${cellsSvg}
  </g>

  <!-- Legend -->
  ${legend}

  <!-- Dashboard widgets -->
  ${dashboardWidgets}

  <!-- Footer -->
  <text x="${W / 2}" y="${footerY}" text-anchor="middle" fill="#8b949e" font-family="'IBM Plex Mono', monospace" font-size="9" letter-spacing="0.5">
    Generated by shapegrid · ${new Date().toISOString().split('T')[0]}
  </text>
</svg>`;
}
// ─── Legend generator ────────────────────────────────────────────────────────
export function generateLegend(colorScale, W, H) {
    const barX = 36;
    const barY = H - 46;
    const barW = 190;
    const barH = 10;
    const panelX = barX - 18;
    const panelY = barY - 32;
    const panelW = barW + 36;
    const panelH = 62;
    // Labels
    const labels = [
        { pos: 0, text: '0' },
        { pos: 0.25, text: '25%' },
        { pos: 0.5, text: '50%' },
        { pos: 0.75, text: '75%' },
        { pos: 1.0, text: 'Max' },
    ];
    const labelElements = labels.map(label => {
        const x = barX + label.pos * barW;
        return `<text x="${x.toFixed(1)}" y="${barY + barH + 14}" text-anchor="middle" fill="#8b949e" font-family="'IBM Plex Mono', monospace" font-size="8" font-variant-numeric="tabular-nums">${label.text}</text>`;
    }).join('\n    ');
    return `  <!-- Legend -->
  <g id="legend">
    <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <text x="${barX}" y="${barY - 10}" fill="#8b949e" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="600" letter-spacing="1.4">
      ACTIVITY INTENSITY
    </text>
    <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="${barH / 2}" fill="url(#legend-grad)" stroke="rgba(255,255,255,0.12)" stroke-width="0.5"/>
    ${labelElements}
  </g>`;
}
// ─── Coordinate Axes ──────────────────────────────────────────────────────────
export function generateCoordAxes(data, cfg, minX, maxX, minY, maxY, W, H, zoom, ISO_YAW, ISO_PITCH) {
    const axesCfg = cfg.axes;
    const enabled = axesCfg?.enabled ?? (data.coordSystem === 'wgs84' || data.coordSystem === 'mercator');
    if (!enabled || !data.geoBounds || !data.coordSystem || data.coordSystem === 'planar') {
        return '';
    }
    const { minLon, maxLon, minLat, maxLat } = data.geoBounds;
    const lonSpan = maxLon - minLon;
    const latSpan = maxLat - minLat;
    // Grid dimensions in normalized space
    const normW = maxX - minX;
    const normH = maxY - minY;
    // Configuration options
    const position = axesCfg?.position ?? 'outside';
    const lineColor = axesCfg?.lineColor ?? '#666666';
    const labelColor = axesCfg?.labelColor ?? '#888888';
    const labelFont = axesCfg?.labelFont ?? 'IBM Plex Mono, monospace';
    const labelScale = axesCfg?.labelScale ?? 1.0;
    const distance = axesCfg?.distance ?? 0.06; // Distance from grid edge
    const fontSize = Math.round(9 * labelScale);
    // Project point to isometric coordinates (same as cells)
    function projectIso(x, y, z = 0) {
        const dx = x - (minX + maxX) / 2;
        const dy = y - (minY + maxY) / 2;
        const dz = z;
        const isoX = (dx * Math.cos(ISO_YAW) - dy * Math.sin(ISO_YAW)) * zoom * (W * 0.4);
        const isoY = (dx * Math.sin(ISO_YAW) * Math.sin(ISO_PITCH) + dy * Math.cos(ISO_YAW) * Math.sin(ISO_PITCH) - dz * Math.cos(ISO_PITCH)) * zoom * (W * 0.4);
        return [W / 2 + isoX, H / 2 + isoY];
    }
    function formatCoord(value, isLat) {
        const absVal = Math.abs(value);
        const dir = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
        return `${absVal.toFixed(1)}°${dir}`;
    }
    function niceInterval(range, targetTicks = 4) {
        const rough = range / targetTicks;
        const exp = Math.floor(Math.log10(rough));
        const frac = rough / Math.pow(10, exp);
        let nice;
        if (frac <= 1.5)
            nice = 1;
        else if (frac <= 3)
            nice = 2;
        else if (frac <= 7)
            nice = 5;
        else
            nice = 10;
        return nice * Math.pow(10, exp);
    }
    const offset = distance;
    const tickLen = 0.015;
    const tickDir = position === 'outside' ? 1 : -1;
    // Grid edges
    const left = minX + (position === 'outside' ? -offset : offset);
    const right = maxX + (position === 'outside' ? offset : -offset);
    const bottom = maxY + (position === 'outside' ? offset : -offset);
    const top = minY + (position === 'outside' ? -offset : offset);
    let svg = `\n  <!-- Coordinate Axes -->\n  <g id="coord-axes" stroke="${lineColor}" stroke-width="1" fill="none">\n`;
    // Bottom axis line (longitude)
    const [bl, blY] = projectIso(left, bottom);
    const [br, brY] = projectIso(right, bottom);
    svg += `    <line x1="${bl.toFixed(1)}" y1="${blY.toFixed(1)}" x2="${br.toFixed(1)}" y2="${brY.toFixed(1)}"/>\n`;
    // Left axis line (latitude)
    const [tl, tlY] = projectIso(left, top);
    svg += `    <line x1="${bl.toFixed(1)}" y1="${blY.toFixed(1)}" x2="${tl.toFixed(1)}" y2="${tlY.toFixed(1)}"/>\n`;
    svg += `  </g>\n  <g id="coord-labels" fill="${labelColor}" font-family="${labelFont}" font-size="${fontSize}">\n`;
    // Longitude ticks
    const lonInterval = niceInterval(lonSpan);
    const lonStart = Math.ceil(minLon / lonInterval) * lonInterval;
    for (let lon = lonStart; lon <= maxLon; lon += lonInterval) {
        const t = (lon - minLon) / lonSpan;
        const x = minX + t * normW;
        const [tx, ty] = projectIso(x, bottom);
        const [tx2, ty2] = projectIso(x, bottom + tickLen * tickDir);
        svg += `    <line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${tx2.toFixed(1)}" y2="${ty2.toFixed(1)}" stroke="${lineColor}" stroke-width="0.5"/>\n`;
        const labelOffset = position === 'outside' ? 12 : -6;
        svg += `    <text x="${tx2.toFixed(1)}" y="${(ty2 + labelOffset).toFixed(1)}" text-anchor="middle">${formatCoord(lon, false)}</text>\n`;
    }
    // Latitude ticks
    const latInterval = niceInterval(latSpan);
    const latStart = Math.ceil(minLat / latInterval) * latInterval;
    for (let lat = latStart; lat <= maxLat; lat += latInterval) {
        const t = (lat - minLat) / latSpan;
        const y = minY + t * normH; // FIX: Don't flip here, the projection already handles it
        const [tx, ty] = projectIso(left, y);
        const [tx2, ty2] = projectIso(left + tickLen * tickDir, y);
        svg += `    <line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${tx2.toFixed(1)}" y2="${ty2.toFixed(1)}" stroke="${lineColor}" stroke-width="0.5"/>\n`;
        const labelOffset = position === 'outside' ? -5 : 8;
        const textAnchor = position === 'outside' ? 'end' : 'start';
        svg += `    <text x="${(tx2 + labelOffset).toFixed(1)}" y="${(ty2 + 3).toFixed(1)}" text-anchor="${textAnchor}">${formatCoord(lat, true)}</text>\n`;
    }
    svg += '  </g>';
    return svg;
}
// ─── SVG utilities ────────────────────────────────────────────────────────────
/** "x,y x,y ..." for a closed polygon (no intermediate array allocations). */
export function polyPoints(pts) {
    let s = '';
    for (let i = 0; i < pts.length; i++) {
        if (i > 0)
            s += ',';
        s += pts[i][0].toFixed(1) + ',' + pts[i][1].toFixed(1);
    }
    return s;
}
/** "x,y" for a single projected point. */
export function fmt(p) {
    return p[0].toFixed(1) + ',' + p[1].toFixed(1);
}
// ─── Color utilities ─────────────────────────────────────────────────────────
export function darkenColor(hex, factor) {
    const rgb = hexToRgb(hex);
    if (!rgb)
        return hex;
    const r = Math.round(rgb.r * factor);
    const g = Math.round(rgb.g * factor);
    const b = Math.round(rgb.b * factor);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
export function lightenColor(hex, factor) {
    const rgb = hexToRgb(hex);
    if (!rgb)
        return hex;
    const r = Math.min(255, Math.round(rgb.r * factor));
    const g = Math.min(255, Math.round(rgb.g * factor));
    const b = Math.min(255, Math.round(rgb.b * factor));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
    } : null;
}
// ─── Date range helper ───────────────────────────────────────────────────────
export function getDateRange(data) {
    const dates = data.grid.cells
        .map(c => c.date)
        .filter(d => d)
        .sort();
    if (dates.length === 0)
        return 'N/A';
    const start = dates[0];
    const end = dates[dates.length - 1];
    // Format as "Apr 2025 - Apr 2026"
    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    };
    return `${formatDate(start)} - ${formatDate(end)}`;
}
//# sourceMappingURL=svg-render.js.map