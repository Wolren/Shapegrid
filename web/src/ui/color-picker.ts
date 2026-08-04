// ══════════════════════════════════════════════════════════════════════════════
// Color picker - swatch button + popover (vanilla-colorful hex picker)
// Used by the Theme tab: Editor Colors and Widget Colors sections.
// The popover uses fixed positioning anchored to the row so it always stays
// inside the sidebar panel; events are delegated on the wrapper so they work
// regardless of custom-element upgrade timing.
// ══════════════════════════════════════════════════════════════════════════════

import 'vanilla-colorful/hex-color-picker.js';
import 'vanilla-colorful/hex-input.js';

const HEX_RE = /^#([0-9a-f]{6})$/i;

export interface ColorPickerOptions {
  /** Initial hex (#rrggbb). */
  value?: string;
  /** Live callback on every color change (drag or typing). */
  onChange?: (hex: string) => void;
  /** Called when the popover closes. */
  onCommit?: (hex: string) => void;
  /** When set, shows a reset action with this label (e.g. 'theme'). */
  resetLabel?: string;
  /** Called when the reset action is clicked. */
  onReset?: () => void;
}

export interface ColorPicker {
  el: HTMLElement;
  setValue(hex: string): void;
  getValue(): string;
  destroy(): void;
}

export function createColorPicker(opts: ColorPickerOptions = {}, parent: HTMLElement | null, replaceTarget?: HTMLElement): ColorPicker {
  let current = HEX_RE.test(opts.value || '') ? (opts.value as string).toLowerCase() : '';

  const wrap = document.createElement('div');
  wrap.className = 'cp-wrap';

  // Swatch button
  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = 'cp-swatch';
  swatch.title = 'Pick a color';
  swatch.style.background = current || 'transparent';
  swatch.setAttribute('aria-label', 'Pick a color');
  wrap.appendChild(swatch);

  // Popover with the saturation/hue picker + hex input
  const pop = document.createElement('div');
  pop.className = 'cp-popover';
  pop.style.display = 'none';

  const picker = document.createElement('hex-color-picker');
  picker.setAttribute('color', current || '#39d353');

  const hexInput = document.createElement('hex-input');
  hexInput.setAttribute('color', current || '#39d353');
  hexInput.setAttribute('prefixed', '');

  const footer = document.createElement('div');
  footer.className = 'cp-footer';

  if (opts.resetLabel) {
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'cp-reset';
    resetBtn.textContent = `reset to ${opts.resetLabel}`;
    resetBtn.addEventListener('click', () => {
      opts.onReset?.();
      closePop();
    });
    footer.appendChild(resetBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'cp-close';
  closeBtn.textContent = 'done';
  closeBtn.addEventListener('click', closePop);
  footer.appendChild(closeBtn);

  pop.appendChild(picker);
  pop.appendChild(hexInput);
  pop.appendChild(footer);
  wrap.appendChild(pop);

  const apply = (hex: string): void => {
    if (!HEX_RE.test(hex)) return;
    current = hex.toLowerCase();
    swatch.style.background = current;
    picker.setAttribute('color', current);
    hexInput.setAttribute('color', current);
    opts.onChange?.(current);
  };

  function openPop(): void {
    pop.style.display = 'block';
    // Fixed positioning, right edge aligned with the containing row: the
    // popover always fits inside the panel (the sidebar clips overflow-x,
    // so absolutely-positioned children would get cut off).
    pop.style.position = 'fixed';
    const sRect = swatch.getBoundingClientRect();
    const row = swatch.closest('.theme-row, .dm-settings-row');
    const rowRect = row ? row.getBoundingClientRect() : sRect;
    pop.style.top = `${sRect.bottom + 4}px`;
    pop.style.right = `${Math.max(8, window.innerWidth - rowRect.right)}px`;
    pop.style.left = 'auto';
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKeyDown);
  }

  function closePop(): void {
    if (pop.style.display === 'none') return;
    pop.style.display = 'none';
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKeyDown);
    opts.onCommit?.(current);
  }

  function onDocDown(e: MouseEvent): void {
    if (!wrap.contains(e.target as Node)) closePop();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') closePop();
  }

  swatch.addEventListener('click', () => {
    if (pop.style.display === 'none') openPop();
    else closePop();
  });

  // Delegated listener: both the hex-color-picker and the hex-input dispatch
  // bubbling 'color-changed' events (bubbles: true), so one listener on the
  // plain wrapper covers both without depending on element instance identity.
  wrap.addEventListener('color-changed', (e: Event) => {
    const v = (e as CustomEvent).detail?.value;
    if (typeof v !== 'string' || !HEX_RE.test(v)) return;
    apply(v);
  });

  if (replaceTarget) replaceTarget.replaceWith(wrap);
  else parent?.appendChild(wrap);

  return {
    el: wrap,
    setValue(hex: string) {
      if (HEX_RE.test(hex)) apply(hex.toLowerCase());
    },
    getValue() {
      return current;
    },
    destroy() {
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('keydown', onKeyDown);
      wrap.remove();
    },
  };
}
