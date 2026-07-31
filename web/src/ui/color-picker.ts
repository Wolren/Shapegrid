// ══════════════════════════════════════════════════════════════════════════════
// Color picker — styled swatch + native color dialog + preset chips
// Zero-dependency: the swatch opens the OS color dialog via a hidden
// <input type="color"> (the same pattern GitHub uses in its theme editor),
// and a row of preset chips gives one-click picks. Fully reliable in any
// browser, no popover positioning to break.
// ══════════════════════════════════════════════════════════════════════════════

const HEX_RE = /^#([0-9a-f]{6})$/i;

const DEFAULT_SWATCHES = ['#39d353', '#1f6feb', '#f85149', '#d29922', '#8b949e', '#e6edf3'];

export interface ColorPickerOptions {
  /** Initial hex (#rrggbb). */
  value?: string;
  /** Live callback on every color change. */
  onChange?: (hex: string) => void;
  /** Called when the user commits (dialog closed / chip picked). */
  onCommit?: (hex: string) => void;
  /** When set, shows a small reset action with this label (e.g. 'theme'). */
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

  // Swatch button — opens the native dialog on click
  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = 'cp-swatch';
  swatch.title = 'Pick a color';
  swatch.style.background = current || 'transparent';
  swatch.setAttribute('aria-label', 'Pick a color');

  // Hidden native input — the actual OS color dialog trigger
  const native = document.createElement('input');
  native.type = 'color';
  native.className = 'cp-native';
  native.value = current || '#39d353';
  native.setAttribute('aria-hidden', 'true');
  native.tabIndex = -1;

  swatch.addEventListener('click', () => native.click());
  native.addEventListener('input', () => {
    apply(native.value);
  });
  native.addEventListener('change', () => {
    apply(native.value);
    opts.onCommit?.(current);
  });

  // Preset chips — one-click quick picks
  const chips = document.createElement('div');
  chips.className = 'cp-chips';
  for (const hex of DEFAULT_SWATCHES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cp-chip';
    chip.style.background = hex;
    chip.title = hex;
    chip.setAttribute('aria-label', hex);
    chip.addEventListener('click', () => {
      apply(hex);
      opts.onCommit?.(hex);
    });
    chips.appendChild(chip);
  }

  const apply = (hex: string): void => {
    if (!HEX_RE.test(hex)) return;
    current = hex.toLowerCase();
    swatch.style.background = current;
    native.value = current;
    opts.onChange?.(current);
  };

  wrap.appendChild(swatch);
  wrap.appendChild(chips);

  if (opts.resetLabel && opts.onReset) {
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'cp-reset';
    resetBtn.textContent = opts.resetLabel;
    resetBtn.title = `Use the site theme accent`;
    resetBtn.addEventListener('click', () => {
      opts.onReset?.();
    });
    wrap.appendChild(resetBtn);
  }

  wrap.appendChild(native);

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
      wrap.remove();
    },
  };
}
