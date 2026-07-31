// ══════════════════════════════════════════════════════════════════════════════
// Widget manager styles — injected CSS for the manager panel
// Extracted from widget-manager.ts (file-size governance)
// ══════════════════════════════════════════════════════════════════════════════

// ── CSS injection ────────────────────────────────────────────────────────────

let _stylesInjected = false;

export function injectStyles(): void {
  if (_stylesInjected) return;
  _stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
/* ── Dashboard Manager Panel ─────────────────────────────────────────────── */
#dashboard-manager {
  position: absolute;
  top: 0;
  right: 0;
  width: 240px;
  max-height: 80%;
  z-index: 25;
  background: rgba(13, 17, 23, 0.88);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-left: 1px solid rgba(48, 54, 61, 0.7);
  border-bottom: 1px solid var(--border);
  border-radius: 0 0 0 var(--radius);
  box-shadow: -8px 0 28px rgba(0, 0, 0, 0.4);
  font-family: var(--mono);
  color: var(--text);
  display: none;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
}

#dashboard-manager.visible {
  display: flex;
}

.dm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: rgba(22, 27, 34, 0.6);
}

.dm-header-title {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  font-weight: 500;
}

.dm-close-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
  font-family: var(--mono);
  transition: color 0.12s;
}

.dm-close-btn:hover {
  color: var(--danger);
}

.dm-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.dm-body::-webkit-scrollbar {
  width: 4px;
}
.dm-body::-webkit-scrollbar-track {
  background: transparent;
}
.dm-body::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 2px;
}

.dm-widget-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(48, 54, 61, 0.3);
  transition: background 0.12s;
}

.dm-widget-row:hover {
  background: rgba(22, 27, 34, 0.5);
}

.dm-widget-title {
  font-size: 10px;
  color: var(--text);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Toggle switch inside the manager (smaller) */
.dm-toggle {
  position: relative;
  width: 28px;
  height: 16px;
  flex-shrink: 0;
}

.dm-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.dm-toggle-slider {
  position: absolute;
  inset: 0;
  background: var(--surface3);
  border: 1px solid var(--border);
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.dm-toggle-slider:hover {
  border-color: #3d444d;
}

.dm-toggle-slider::before {
  content: '';
  position: absolute;
  width: 10px;
  height: 10px;
  left: 2px;
  top: 2px;
  background: var(--muted);
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}

.dm-toggle input:checked + .dm-toggle-slider {
  background: #1a3a1a;
  border-color: var(--accent);
}

.dm-toggle input:checked + .dm-toggle-slider::before {
  transform: translateX(12px);
  background: var(--accent);
}

/* Position dropdown */
.dm-pos-select {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 9px;
  padding: 2px 5px;
  width: 74px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.12s, color 0.12s;
}

.dm-pos-select:hover {
  border-color: var(--accent);
}

.dm-pos-select:focus {
  border-color: var(--accent2);
}

.dm-pos-select option {
  background: var(--surface2);
  color: var(--text);
}

/* Settings section */
.dm-settings {
  padding: 6px 10px 6px 30px;
  border-bottom: 1px solid rgba(48, 54, 61, 0.2);
}

.dm-settings-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.dm-settings-row:last-child {
  margin-bottom: 0;
}

.dm-settings-label {
  font-size: 9px;
  color: var(--muted);
  min-width: 56px;
  white-space: nowrap;
}

.dm-settings-row input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  flex: 1;
  height: 3px;
  background: var(--surface3);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.dm-settings-row input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 11px;
  height: 11px;
  background: var(--accent);
  border: 2px solid #0d1117;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(57, 211, 83, 0.3);
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
}

.dm-settings-row input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.15);
  box-shadow: 0 0 0 3px rgba(57, 211, 83, 0.22);
}

.dm-settings-row input[type="range"]::-moz-range-track {
  height: 3px;
  background: var(--surface3);
  border-radius: 2px;
}

.dm-settings-row input[type="range"]::-moz-range-thumb {
  width: 7px;
  height: 7px;
  border: 2px solid #0d1117;
  background: var(--accent);
  border-radius: 50%;
}

.dm-settings-value {
  font-size: 9px;
  color: var(--accent);
  min-width: 24px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.dm-settings-row input[type="checkbox"] {
  width: 12px;
  height: 12px;
  accent-color: var(--accent);
  cursor: pointer;
}

.dm-settings-row select {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-family: var(--mono);
  font-size: 9px;
  padding: 2px 5px;
  flex: 1;
  cursor: pointer;
  outline: none;
  transition: border-color 0.12s;
}

.dm-settings-row select:hover {
  border-color: #3d444d;
}

/* Action buttons row */
.dm-actions {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.dm-btn {
  flex: 1;
  padding: 4px 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted);
  font-family: var(--mono);
  font-size: 9px;
  cursor: pointer;
  text-align: center;
  transition: all 0.12s;
}

.dm-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: #0e2a0e;
}

.dm-btn.danger:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: #2a0e0e;
}

/* ── Dashboard Manager Toggle Button ─────────────────────────────────────── */
#btn-dashboard-manager {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.12s;
  position: relative;
}

#btn-dashboard-manager:hover {
  color: var(--text);
  background: var(--surface2);
  border-color: var(--border);
}

#btn-dashboard-manager.active {
  color: var(--accent);
  background: #0e2a0e;
  border-color: var(--accent);
}

#btn-dashboard-manager[data-tip]:hover::after {
  content: attr(data-tip);
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  padding: 2px 6px;
  font-size: 9px;
  font-family: var(--mono);
  color: var(--text);
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  pointer-events: none;
  z-index: 35;
}
`;
  document.head.appendChild(style);
}

