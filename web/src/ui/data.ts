// ══════════════════════════════════════════════════════════════════════════════
// Data loading and demo data generation
// ══════════════════════════════════════════════════════════════════════════════

import { state, updateState } from './state';
import { fetchContributions } from './github';
import { generateGrid } from '../geometry/engine';
import { scheduleRebuild } from './rebuild';

export async function loadData(): Promise<void> {
  const user = (document.getElementById('inp-user') as HTMLInputElement).value.trim();
  const token = (document.getElementById('inp-token') as HTMLInputElement).value.trim();
  if (!user || !token) {
    setStatus('Enter username and token', 'error');
    return;
  }

  const days = parseFloat((document.getElementById('inp-days') as HTMLInputElement).value);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);

  setStatus('Fetching contributions…', '');
  (document.getElementById('btn-fetch') as HTMLButtonElement).disabled = true;

  try {
    const contrib = await fetchContributions(user, start, end, token);
    updateState('contributions', contrib);
    (document.getElementById('stat-contrib') as HTMLElement).textContent = contrib.total.toLocaleString();

    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const filtered = contrib.days.filter(d => d.date >= startStr && d.date <= endStr);
    const maxC = Math.max(1, ...filtered.map(d => d.contributionCount));

    computeGrid();

    const N = state.grid?.cells.length || state.count;
    updateState('cellData', Array.from({ length: N }, (_, i) => {
      const d = filtered[i];
      return d
        ? { date: d.date, count: d.contributionCount, intensity: d.contributionCount / maxC }
        : { date: '', count: 0, intensity: 0 };
    }));

    setStatus(`✓ ${contrib.total} contributions · @${user}`, 'ok');
    scheduleRebuild();
    (document.getElementById('footer-gen') as HTMLElement).textContent = `generated ${new Date().toLocaleDateString()}`;
  } catch (e: any) {
    setStatus(e.message, 'error');
  } finally {
    (document.getElementById('btn-fetch') as HTMLButtonElement).disabled = false;
  }
}

export function computeGrid(): void {
  updateState('grid', generateGrid(state.poly, { count: state.count, type: state.gridType, thr: state.coverage }));
  (document.getElementById('stat-cells') as HTMLElement).textContent = String(state.grid!.cells.length);
}

export function setStatus(msg: string, cls: string): void {
  const el = document.getElementById('status-line')!;
  el.textContent = msg;
  el.className = cls || '';
}

export function loadDemo(): void {
  const N = state.count;
  const max = 15;
  updateState('cellData', Array.from({ length: N }, (_, i) => {
    const noise = Math.sin(i * 0.3) * Math.cos(i * 0.07) * 0.5 + 0.5;
    const count = Math.round(noise * max);
    return { date: '', count, intensity: count / max };
  }));
  updateState('contributions', { username: 'demo', total: state.cellData.reduce((s, d) => s + d.count, 0), days: [] });
  (document.getElementById('stat-contrib') as HTMLElement).textContent = state.contributions!.total.toLocaleString();
}

export { scheduleRebuild };
