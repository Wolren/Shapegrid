// ══════════════════════════════════════════════════════════════════════════════
// SVG dashboard widgets - server-side port of the web viewer's overlay widgets.
// Reads the dashboard section from ShapegridConfig and emits SVG groups at the
// configured positions (customPos or zone anchors) with per-widget accent /
// secondary colours and scale, mirroring web/src/ui/dashboard.ts rendering.
// ══════════════════════════════════════════════════════════════════════════════
// ─── Colour helpers (mirror web/src/ui/dashboard.ts) ─────────────────────────
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            default: h = (r - g) / d + 4;
        }
        h /= 6;
    }
    return [h, s, l];
}
function hslToHex(h, s, l) {
    const hue2rgb = (p, q, t) => {
        if (t < 0)
            t += 1;
        if (t > 1)
            t -= 1;
        if (t < 1 / 6)
            return p + (q - p) * 6 * t;
        if (t < 1 / 2)
            return q;
        if (t < 2 / 3)
            return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    if (s === 0) {
        const v = Math.round(l * 255);
        return `#${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}`;
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const g = Math.round(hue2rgb(p, q, h) * 255);
    const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
/** GitHub-style lightness ramp built from a widget accent (mirror accentRamp). */
export function accentRamp(accent, steps = 5) {
    const m = /^#([0-9a-f]{6})$/i.exec(accent);
    if (!m)
        return ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
    const n = parseInt(m[1], 16);
    const [h, s] = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
    const levels = [0.16, 0.26, 0.38, 0.49, 0.60];
    const out = [];
    for (let i = 0; i < steps; i++) {
        out.push(hslToHex(h, Math.min(s, 0.85), levels[Math.min(i, levels.length - 1)]));
    }
    return out;
}
function hexToRgba(hex, alpha) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m)
        return `rgba(255,255,255,${alpha})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// ─── Widget frame + positioning (mirror web dashboard.ts renderAllWidgets) ────
const ZONE_ANCHORS = {
    topLeft: { x: 4, y: 36, align: 'start' },
    topRight: { x: 96, y: 36, align: 'end' },
    bottomLeft: { x: 4, y: 96, align: 'start' },
    bottomRight: { x: 96, y: 96, align: 'end' },
    left: { x: 4, y: 50, align: 'start' },
    right: { x: 96, y: 50, align: 'end' },
};
function widgetSetting(w, key, fallback) {
    const s = w.settings ?? {};
    return s[key] !== undefined ? s[key] : fallback;
}
function escAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/**
 * Compute the widget's top-left (x, y) in SVG pixels from customPos (percent
 * of viewport, like the web) or a zone anchor (percent of viewport). Returns
 * null when the widget should be skipped (unpositioned).
 */
// The webview's #dashboard-widgets container sits inside #canvas-wrap with a
// 32px top inset (CSS: inset: 32px 0 0 0). Widget customPos percentages are
// relative to THAT container, so the SVG must replicate: x = pct/100 * W,
// y = 32 + pct/100 * (H - 32). Mirroring the webview keeps widget positions
// aligned with the grid exactly as configured.
const WIDGET_CONTAINER_TOP_INSET = 32;
function widgetOrigin(ctx, wPx, hPx) {
    const cp = ctx.w.customPos;
    if (cp && typeof cp.x === 'number' && typeof cp.y === 'number') {
        const contH = ctx.H - WIDGET_CONTAINER_TOP_INSET;
        return {
            x: (cp.x / 100) * ctx.W,
            y: WIDGET_CONTAINER_TOP_INSET + (cp.y / 100) * contH,
        };
    }
    const anchor = ZONE_ANCHORS[ctx.w.position ?? 'bottomLeft'];
    if (!anchor)
        return null;
    let x;
    if (anchor.align === 'end')
        x = (anchor.x / 100) * ctx.W - wPx;
    else if (anchor.align === 'center')
        x = (anchor.x / 100) * ctx.W - wPx / 2;
    else
        x = (anchor.x / 100) * ctx.W;
    const contH = ctx.H - WIDGET_CONTAINER_TOP_INSET;
    let y;
    if (ctx.w.position === 'left' || ctx.w.position === 'right')
        y = WIDGET_CONTAINER_TOP_INSET + (anchor.y / 100) * contH - hPx / 2;
    else if (ctx.w.position === 'bottomLeft' || ctx.w.position === 'bottomRight')
        y = WIDGET_CONTAINER_TOP_INSET + (anchor.y / 100) * contH - hPx;
    else
        y = WIDGET_CONTAINER_TOP_INSET + (anchor.y / 100) * contH;
    return { x, y };
}
/** SVG group wrapper: panel frame (accent border/header), title, body. */
function widgetFrame(ctx, bodySvg, wPx, hPx, bodyYOffset) {
    const accent = ctx.accent;
    const secondary = ctx.secondary;
    const scale = ctx.scale;
    const origin = widgetOrigin(ctx, wPx, hPx + bodyYOffset);
    if (!origin)
        return '';
    // Exact webview positioning: the webview's #dashboard-widgets container has
    // overflow:hidden and does NOT clamp widget origins, so neither do we.
    const headerH = 22 * scale;
    const x = origin.x;
    const y = origin.y;
    const titleY = y + 10 * scale;
    const bodyX = x;
    const bodyY = y + headerH;
    const bodyH = hPx;
    const opacityAttr = ctx.opacity < 1 ? ` opacity="${ctx.opacity.toFixed(2)}"` : '';
    return `
  <g id="widget-${escAttr(ctx.w.id)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"${opacityAttr}>
    <rect x="0" y="0" width="${wPx.toFixed(1)}" height="${(headerH + bodyH).toFixed(1)}" rx="8" fill="rgba(13,17,23,0.85)" stroke="${hexToRgba(accent, 0.4)}" stroke-width="1"/>
    <rect x="0" y="0" width="${wPx.toFixed(1)}" height="${headerH.toFixed(1)}" rx="8" fill="${hexToRgba(accent, 0.10)}"/>
    <rect x="0" y="${(headerH - 1).toFixed(1)}" width="${wPx.toFixed(1)}" height="1" fill="${hexToRgba(accent, 0.4)}"/>
    <text x="10" y="${titleY.toFixed(1)}" fill="${escAttr(accent)}" font-family="'IBM Plex Mono', monospace" font-size="${(8 * scale).toFixed(1)}" font-weight="500" letter-spacing="1.2" text-transform="uppercase">${esc((ctx.w.title ?? ctx.w.id).toUpperCase())}</text>
    <g transform="translate(0 ${headerH.toFixed(1)})">${bodySvg}</g>
  </g>`;
}
// ─── Legend ───────────────────────────────────────────────────────────────────
function renderLegend(ctx, data) {
    const accent = ctx.accent;
    const secondary = ctx.secondary;
    const scale = ctx.scale;
    const ramp = accentRamp(accent, 5);
    const maxVal = data.totalContributions ?? data.grid.cells.reduce((m, c) => Math.max(m, c.count), 0);
    const barW = 150 * scale;
    const barH = 20 * scale;
    const bodyW = barW + 20;
    const bodyH = 58 * scale;
    const stops = ramp.map((c, i) => `<stop offset="${((i / (ramp.length - 1)) * 100).toFixed(0)}%" stop-color="${c}"/>`).join('');
    const labels = [
        `<text x="0" y="${(bodyH - 2).toFixed(1)}" fill="${escAttr(secondary)}" font-family="'IBM Plex Mono', monospace" font-size="${(10 * scale).toFixed(1)}">0</text>`,
        `<text x="${(barW / 2).toFixed(1)}" y="${(bodyH - 2).toFixed(1)}" text-anchor="middle" fill="${escAttr(secondary)}" font-family="'IBM Plex Mono', monospace" font-size="${(9 * scale).toFixed(1)}">per day</text>`,
        `<text x="${barW.toFixed(1)}" y="${(bodyH - 2).toFixed(1)}" text-anchor="end" fill="${escAttr(accent)}" font-family="'IBM Plex Mono', monospace" font-size="${(10 * scale).toFixed(1)}" font-weight="600">${maxVal.toLocaleString()}</text>`,
    ].join('');
    const body = `
    <text x="0" y="12" fill="${escAttr(secondary)}" font-family="'IBM Plex Mono', monospace" font-size="${(9 * scale).toFixed(1)}" font-weight="600" letter-spacing="1.2">CONTRIBUTIONS</text>
    <rect x="0" y="18" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="url(#widget-legend-grad)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    ${labels}`;
    return widgetFrame(ctx, body, bodyW, bodyH, 34 * scale) + `
  <defs><linearGradient id="widget-legend-grad" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>`;
}
// ─── Stats ────────────────────────────────────────────────────────────────────
function renderStats(ctx, data) {
    const accent = ctx.accent;
    const secondary = ctx.secondary;
    const scale = ctx.scale;
    const ramp = accentRamp(accent, 5);
    const total = data.totalContributions ?? 0;
    const cellCount = data.grid.cells.length;
    const cellData = data.grid.cells;
    const activeDays = cellData.filter(d => d.count > 0).length;
    const consistency = cellCount > 0 ? (activeDays / cellCount * 100) : 0;
    const low = cellData.filter(d => d.intensity > 0 && d.intensity <= 0.33).length;
    const med = cellData.filter(d => d.intensity > 0.33 && d.intensity <= 0.66).length;
    const high = cellData.filter(d => d.intensity > 0.66).length;
    const maxCount = cellData.length > 0 ? Math.max(...cellData.map(d => d.count)) : 0;
    const avg = cellCount > 0 ? (total / cellCount).toFixed(1) : '0';
    const bodyW = 220 * scale;
    const big = (val, label, x) => `
    <text x="${x.toFixed(1)}" y="20" fill="${escAttr(accent)}" font-family="system-ui, sans-serif" font-size="${(18 * scale).toFixed(1)}" font-weight="700">${esc(val)}</text>
    <text x="${x.toFixed(1)}" y="32" fill="${escAttr(secondary)}" font-family="system-ui, sans-serif" font-size="${(8 * scale).toFixed(1)}" letter-spacing="0.6" text-transform="uppercase">${esc(label.toUpperCase())}</text>`;
    const detail = `
    <text x="0" y="48" fill="#8b949e" font-family="system-ui, sans-serif" font-size="${(9 * scale).toFixed(1)}">User: ${esc(data.username)} · Max: ${maxCount.toLocaleString()} · Avg: ${esc(avg)}/d</text>`;
    const totalBars = (low + med + high) || 1;
    const segs = [
        { pct: low / totalBars, color: ramp[1] },
        { pct: med / totalBars, color: ramp[3] },
        { pct: high / totalBars, color: ramp[4] },
    ];
    let barX = 0;
    const segRects = segs.filter(s => s.pct > 0).map(s => {
        const w = s.pct * (bodyW - 20);
        const r = `<rect x="${barX.toFixed(1)}" y="58" width="${w.toFixed(1)}" height="5" rx="2.5" fill="${s.color}"/>`;
        barX += w;
        return r;
    }).join('');
    const distLabels = `
    <text x="0" y="72" fill="#8b949e" font-family="system-ui, sans-serif" font-size="${(8 * scale).toFixed(1)}">Low ${low}</text>
    <text x="${((bodyW - 20) / 2).toFixed(1)}" y="72" text-anchor="middle" fill="#8b949e" font-family="system-ui, sans-serif" font-size="${(8 * scale).toFixed(1)}">Med ${med}</text>
    <text x="${(bodyW - 20).toFixed(1)}" y="72" text-anchor="end" fill="#8b949e" font-family="system-ui, sans-serif" font-size="${(8 * scale).toFixed(1)}">High ${high}</text>`;
    const body = `
    ${big(total.toLocaleString(), 'Contributions', 0)}
    ${big(cellCount.toLocaleString(), 'Cells', 76 * scale)}
    ${big(`${Math.round(consistency)}%`, 'Consistency', 152 * scale)}
    ${detail}
    ${segRects}
    ${distLabels}`;
    return widgetFrame(ctx, body, bodyW, 74 * scale, 34 * scale);
}
// ─── Timeline (sparkline) ────────────────────────────────────────────────────
function renderTimeline(ctx, data) {
    const accent = ctx.accent;
    const scale = ctx.scale;
    const maxDays = widgetSetting(ctx.w, 'days', 90) || 90;
    const days = data.days ?? [];
    const bodyW = 180 * scale;
    const svgW = bodyW - 16;
    const svgH = 58 * scale;
    const padTop = 14 * scale;
    const padBottom = 4 * scale;
    const plotArea = svgH - padTop - padBottom;
    if (days.length === 0) {
        const body = `<text x="${(bodyW / 2).toFixed(1)}" y="24" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-style="italic" font-family="system-ui, sans-serif" font-size="${(10 * scale).toFixed(1)}">No timeline data</text>`;
        return widgetFrame(ctx, body, bodyW, 60 * scale, 34 * scale);
    }
    const recentDays = days.slice(-maxDays);
    const count = recentDays.length;
    const maxContrib = Math.max(...recentDays.map(d => d.contributionCount), 1);
    const xScale = (i) => (count > 1 ? (i / (count - 1)) * (svgW - 2) + 1 : svgW / 2);
    const yScale = (v) => padTop + plotArea - (v / maxContrib) * plotArea;
    const points = [];
    for (let i = 0; i < count; i++) {
        points.push(`${xScale(i).toFixed(1)},${yScale(recentDays[i].contributionCount).toFixed(1)}`);
    }
    const fillPoints = [
        `${xScale(0).toFixed(1)},${(padTop + plotArea).toFixed(1)}`,
        ...points,
        `${xScale(count - 1).toFixed(1)},${(padTop + plotArea).toFixed(1)}`,
    ].join(' ');
    const top3 = recentDays
        .map((d, i) => ({ count: d.contributionCount, idx: i }))
        .sort((a, b) => b.count - a.count)
        .slice(0, Math.min(3, count))
        .map(x => x.idx);
    const peakDots = top3.map(idx => `<circle cx="${xScale(idx).toFixed(1)}" cy="${yScale(recentDays[idx].contributionCount).toFixed(1)}" r="2" fill="${accent}" stroke="#0d1117" stroke-width="1"/>`).join('');
    const bestIdx = recentDays.reduce((best, d, i, arr) => d.contributionCount > arr[best].contributionCount ? i : best, 0);
    const bestCount = recentDays[bestIdx].contributionCount;
    const maxLabel = bestCount > 0
        ? `<text x="${xScale(bestIdx).toFixed(1)}" y="${(yScale(bestCount) - 5).toFixed(1)}" text-anchor="middle" fill="${accent}" font-family="system-ui, sans-serif" font-size="${(7 * scale).toFixed(1)}" font-weight="600">Max: ${bestCount}</text>`
        : '';
    const body = `
    <svg x="8" y="0" width="${svgW.toFixed(1)}" height="${(svgH + 2).toFixed(1)}" viewBox="0 0 ${svgW.toFixed(1)} ${(svgH + 2).toFixed(1)}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="widget-tl-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${fillPoints}" fill="url(#widget-tl-grad)"/>
      <polyline points="${points.join(' ')}" fill="none" stroke="${accent}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${peakDots}
      ${maxLabel}
    </svg>`;
    return widgetFrame(ctx, body, bodyW, 60 * scale, 34 * scale);
}
// ─── Languages ────────────────────────────────────────────────────────────────
function renderLanguages(ctx, data) {
    const secondary = ctx.secondary;
    const scale = ctx.scale;
    const maxItems = widgetSetting(ctx.w, 'maxItems', 5) || 5;
    const langs = (data.languages ?? []).slice(0, maxItems);
    const bodyW = 200 * scale;
    if (langs.length === 0) {
        const body = `<text x="${(bodyW / 2).toFixed(1)}" y="24" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-style="italic" font-family="system-ui, sans-serif" font-size="${(10 * scale).toFixed(1)}">No language data</text>`;
        return widgetFrame(ctx, body, bodyW, 60 * scale, 34 * scale);
    }
    const rowH = 18 * scale;
    const rows = langs.map((lang, i) => {
        const y = i * rowH;
        const barW = (lang.percentage / 100) * (bodyW - 90);
        return `
    <circle cx="6" cy="${(y + 6).toFixed(1)}" r="4" fill="${escAttr(lang.color)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    <text x="16" y="${(y + 9).toFixed(1)}" fill="${escAttr(secondary)}" font-family="system-ui, sans-serif" font-size="${(10 * scale).toFixed(1)}">${esc(lang.name)}</text>
    <rect x="82" y="${(y + 2.5).toFixed(1)}" width="${(bodyW - 90).toFixed(1)}" height="${(8 * scale).toFixed(1)}" rx="4" fill="rgba(255,255,255,0.08)"/>
    <rect x="82" y="${(y + 2.5).toFixed(1)}" width="${barW.toFixed(1)}" height="${(8 * scale).toFixed(1)}" rx="4" fill="${escAttr(lang.color)}"/>
    <text x="${(bodyW - 4).toFixed(1)}" y="${(y + 9).toFixed(1)}" text-anchor="end" fill="${escAttr(secondary)}73" font-family="'IBM Plex Mono', monospace" font-size="${(9 * scale).toFixed(1)}">${lang.percentage.toFixed(1)}%</text>`;
    }).join('');
    const bodyH = langs.length * rowH;
    return widgetFrame(ctx, rows, bodyW, bodyH, 34 * scale);
}
// ─── Streak ───────────────────────────────────────────────────────────────────
function renderStreak(ctx, data) {
    const accent = ctx.accent;
    const secondary = ctx.secondary;
    const scale = ctx.scale;
    const days = data.days ?? [];
    let body;
    let bodyH = 60 * scale;
    if (days.length === 0) {
        body = `<text x="80" y="24" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-style="italic" font-family="system-ui, sans-serif" font-size="${(10 * scale).toFixed(1)}">No streak data</text>`;
    }
    else {
        let current = 0;
        for (let i = days.length - 1; i >= 0; i--) {
            if (days[i].contributionCount > 0)
                current++;
            else
                break;
        }
        let longest = 0, run = 0;
        for (const d of days) {
            if (d.contributionCount > 0) {
                run++;
                if (run > longest)
                    longest = run;
            }
            else
                run = 0;
        }
        const col = (val, label, x) => `
      <text x="${x.toFixed(1)}" y="24" fill="${escAttr(accent)}" font-family="system-ui, sans-serif" font-size="${(22 * scale).toFixed(1)}" font-weight="700" font-variant-numeric="tabular-nums">${esc(val)}</text>
      <text x="${x.toFixed(1)}" y="38" fill="${escAttr(secondary)}" font-family="system-ui, sans-serif" font-size="${(8 * scale).toFixed(1)}" letter-spacing="0.6" text-transform="uppercase">${esc(label.toUpperCase())}</text>`;
        body = `${col(String(current), 'Current', 8)}${col(String(longest), 'Longest', 88)}`;
    }
    return widgetFrame(ctx, body, 170 * scale, bodyH, 34 * scale);
}
// ─── Entry point ──────────────────────────────────────────────────────────────
const RENDERERS = {
    legend: renderLegend,
    stats: renderStats,
    timeline: renderTimeline,
    languages: renderLanguages,
    streak: renderStreak,
};
/**
 * Render all visible, supported dashboard widgets as SVG groups. Widgets with
 * unsupported ids (not ported to SVG) are skipped silently. Empty string when
 * the dashboard section is absent or no widget is visible/supported.
 */
export function renderDashboardWidgets(data, widgets, W, H) {
    if (!widgets || widgets.length === 0)
        return '';
    const visible = widgets
        .filter(w => w.visible !== false && RENDERERS[w.id])
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (visible.length === 0)
        return '';
    const out = [];
    for (const w of visible) {
        const settings = w.settings ?? {};
        const accent = (typeof settings.accent === 'string' && /^#[0-9a-f]{6}$/i.test(settings.accent))
            ? settings.accent.toLowerCase()
            : '#39d353';
        const secondary = (typeof settings.secondary === 'string' && /^#[0-9a-f]{6}$/i.test(settings.secondary))
            ? settings.secondary.toLowerCase()
            : '#2ea043';
        const scale = (typeof settings.scale === 'number' && settings.scale > 0) ? settings.scale : 1;
        const opacity = (typeof settings.opacity === 'number' && settings.opacity > 0) ? settings.opacity : 1;
        const ctx = { w, accent, secondary, scale, opacity, W, H };
        try {
            out.push(RENDERERS[w.id](ctx, data));
        }
        catch (e) {
            console.warn(`[shapegrid] widget "${w.id}" render failed:`, e);
        }
    }
    return out.join('\n');
}
//# sourceMappingURL=svg-widgets.js.map