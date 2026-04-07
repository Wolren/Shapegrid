// ══════════════════════════════════════════════════════════════════════════════
// Rebuild trigger - shared between modules
// ══════════════════════════════════════════════════════════════════════════════

let _needsRebuild = false;

export function scheduleRebuild() {
  _needsRebuild = true;
}

export function needsRebuild(): boolean {
  const v = _needsRebuild;
  _needsRebuild = false;
  return v;
}
