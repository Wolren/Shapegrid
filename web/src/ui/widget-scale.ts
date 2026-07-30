// ══════════════════════════════════════════════════════════════════════════════
// Widget: Scale Bar — Professional GIS scale with alternating segments
// ══════════════════════════════════════════════════════════════════════════════

import { state } from './state';
import { registerWidget, getWidgetSetting } from './dashboard';

function renderScaleBar(container: HTMLElement, _id: string): void {
  const unit = getWidgetSetting('scaleBar', 'unit', 'normalized') as string;
  const cellSize = state.grid?.cellSize ?? 1;

  // Compute a human-readable scale division
  // We show 3 segments, each representing a meaningful round number
  const rawSegment = cellSize * 3; // 3 cells worth per segment
  const segmentValue = roundToNice(rawSegment);
  const barWidth = 120; // px
  const segments = 3;

  container.style.fontSize = '10px';
  container.style.padding = '6px 8px';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';

  // Scale bar: alternating black/white segments (GIS convention)
  const barContainer = document.createElement('div');
  barContainer.style.position = 'relative';
  barContainer.style.width = `${barWidth}px`;
  barContainer.style.height = '12px';

  const barSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  barSvg.setAttribute('width', `${barWidth}`);
  barSvg.setAttribute('height', '12');
  barSvg.style.display = 'block';

  const segPx = barWidth / segments;
  for (let i = 0; i < segments; i++) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const x = i * segPx;
    rect.setAttribute('x', `${x}`);
    rect.setAttribute('y', '0');
    rect.setAttribute('width', `${segPx}`);
    rect.setAttribute('height', '10');
    rect.setAttribute('fill', i % 2 === 0 ? '#e6edf3' : '#1a1a2e');
    barSvg.appendChild(rect);
  }

  // Tick marks at segment boundaries
  for (let i = 0; i <= segments; i++) {
    const x = (i / segments) * barWidth;
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tick.setAttribute('x1', `${x}`);
    tick.setAttribute('y1', '10');
    tick.setAttribute('x2', `${x}`);
    tick.setAttribute('y2', '12');
    tick.setAttribute('stroke', '#e6edf3');
    tick.setAttribute('stroke-width', '1');
    barSvg.appendChild(tick);
  }

  barContainer.appendChild(barSvg);
  container.appendChild(barContainer);

  // Label row — show 0, mid, and end value
  const labelRow = document.createElement('div');
  labelRow.style.display = 'flex';
  labelRow.style.justifyContent = 'space-between';
  labelRow.style.width = `${barWidth}px`;
  labelRow.style.marginTop = '2px';
  labelRow.style.color = 'rgba(255,255,255,0.6)';
  labelRow.style.fontSize = '9px';

  const leftLabel = document.createElement('span');
  leftLabel.textContent = '0';
  const midLabel = document.createElement('span');
  midLabel.textContent = unitLabel(segmentValue, unit);
  const rightLabel = document.createElement('span');
  rightLabel.textContent = unitLabel(segmentValue * segments, unit);

  labelRow.appendChild(leftLabel);
  labelRow.appendChild(midLabel);
  labelRow.appendChild(rightLabel);
  container.appendChild(labelRow);
}

/** Round to a nice human-readable number for scale markings */
function roundToNice(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

function unitLabel(value: number, unit: string): string {
  const rounded = Math.round(value * 100) / 100;
  if (unit === 'normalized') return `${rounded}`;
  return `${rounded} ${unit}`;
}

registerWidget('scaleBar', renderScaleBar);
