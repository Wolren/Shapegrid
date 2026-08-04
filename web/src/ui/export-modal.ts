// ══════════════════════════════════════════════════════════════════════════════
// Export preview modal - shows the final render before downloading
// ══════════════════════════════════════════════════════════════════════════════

export interface ExportPreviewHandles {
  close: () => void;
}

/**
 * Show a modal with the rendered final image and download/copy actions.
 * @param image      The composited final render canvas
 * @param width      Export width in px
 * @param height     Export height in px
 * @param onDownload Called when the user clicks Download
 */
export function showExportModal(
  image: HTMLCanvasElement,
  width: number,
  height: number,
  onDownload: () => void
): ExportPreviewHandles {
  const existing = document.getElementById('export-preview');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'export-preview';
  overlay.className = 'export-preview-overlay';

  const panel = document.createElement('div');
  panel.className = 'export-preview-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'export-preview-header';

  const title = document.createElement('span');
  title.className = 'export-preview-title';
  title.textContent = 'Final render preview';

  const meta = document.createElement('span');
  meta.className = 'export-preview-meta';
  meta.textContent = `${width} × ${height} px`;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'export-preview-close';
  closeBtn.textContent = '\u2715';
  closeBtn.title = 'Close';

  header.appendChild(title);
  header.appendChild(meta);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Image area
  const imgWrap = document.createElement('div');
  imgWrap.className = 'export-preview-image-wrap';

  const img = document.createElement('img');
  img.className = 'export-preview-image';
  img.alt = 'Final render preview';
  img.src = image.toDataURL('image/png');

  imgWrap.appendChild(img);
  panel.appendChild(imgWrap);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'export-preview-actions';

  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'export-preview-btn primary';
  downloadBtn.textContent = 'Download PNG';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'export-preview-btn';
  copyBtn.textContent = 'Copy to clipboard';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'export-preview-btn';
  cancelBtn.textContent = 'Cancel';

  actions.appendChild(downloadBtn);
  actions.appendChild(copyBtn);
  actions.appendChild(cancelBtn);
  panel.appendChild(actions);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // ── Actions ────────────────────────────────────────────────────────────

  const close = (): void => {
    overlay.remove();
  };

  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });
  window.addEventListener('keydown', onKey);

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', onKey);
    }
  }

  downloadBtn.addEventListener('click', () => {
    onDownload();
  });

  copyBtn.addEventListener('click', async () => {
    try {
      const blob = await new Promise<Blob | null>(resolve => image.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('toBlob failed');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      copyBtn.textContent = 'Copied \u2713';
      setTimeout(() => { copyBtn.textContent = 'Copy to clipboard'; }, 1600);
    } catch {
      copyBtn.textContent = 'Copy failed';
      setTimeout(() => { copyBtn.textContent = 'Copy to clipboard'; }, 1600);
    }
  });

  return { close };
}
