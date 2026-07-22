// src/components/common/Slider/Slider.tsx
/**
 * Slider — a horizontal value slider that folds the LABEL and the current
 * VALUE into the track itself, instead of laying them out as a separate
 * caption row + numeric readout beside an `<input type=range>`.
 *
 * Why it exists: the house control is a label row with a thin range slider
 * and a right-aligned number (see SettingsPanel's `.panelRow`). That eats
 * three columns of horizontal space per control. This packs the same
 * information into one pill — label pinned left, value pinned right, the fill
 * bar painted *behind* both — so a stack of them reads as a dense dial board.
 * It's a reimplementation of dialkit's Slider adapted to skymap's tokens.
 *
 * Why no animation library: the reference drives the fill width and a
 * rubber-band overscroll with `motion/react` springs. We add no dependency —
 * the fill width is a plain inline-style percentage, and its easing is a CSS
 * `transition` (the `--duration-*` / `--ease-standard` tokens). The transition
 * is what makes a keyboard nudge glide; during a pointer drag we add
 * `.dragging`, which sets `transition: none` so the fill tracks the finger with
 * no lag rather than chasing it one eased step behind. The rubber-band
 * overscroll and the click-to-type value editing from the reference are dropped
 * as non-essential; the fill edge is the only progress cue (no separate handle).
 *
 * Drag math: the track's bounding rect is captured on pointer-down; a pointer
 * at clientX maps to the fraction `(clientX - rect.left) / rect.width`, clamped
 * to 0..1, then scaled into `[min, max]` and snapped to the `step` grid. Because
 * the fill spans the full padded width (`inset: 0`), fraction 0 sits at the left
 * edge and 1 at the right, so the fill edge and the pointer agree. There is no
 * native `<input type=range>`, so slider semantics are supplied explicitly via
 * `role="slider"` + `aria-value*` and arrow-key handling.
 */

import { useRef, useState, type PointerEvent, type KeyboardEvent, type ReactNode } from 'react';
import cx from 'classnames';
import styles from './Slider.module.css';

export type SliderProps = {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly onChange: (value: number) => void;
  /** Formats the value shown inside the pill. Defaults to fixed decimals derived from `step`. */
  readonly format?: (value: number) => string;
  readonly disabled?: boolean;
};

/** Decimal places implied by a step (0.1 → 1, 0.01 → 2, 5 → 0). */
function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const dot = String(step).indexOf('.');
  return dot === -1 ? 0 : String(step).length - dot - 1;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Snap to the step grid (measured from `min`) and strip binary-float dust. */
function snapToStep(raw: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((raw - min) / step) * step;
  return parseFloat(clamp(snapped, min, max).toFixed(decimalsForStep(step)));
}

function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format,
  disabled = false,
}: SliderProps): ReactNode {
  const rectRef = useRef<DOMRect | null>(null);
  const [dragging, setDragging] = useState(false);

  const span = max - min || 1;
  const fraction = clamp((value - min) / span, 0, 1);
  const percent = fraction * 100;
  const display = format ? format(value) : value.toFixed(decimalsForStep(step));

  const commitFromClientX = (clientX: number) => {
    const rect = rectRef.current;
    if (!rect) return;
    const t = clamp((clientX - rect.left) / rect.width, 0, 1);
    const next = snapToStep(min + t * span, min, max, step);
    if (next !== value) onChange(next);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    rectRef.current = e.currentTarget.getBoundingClientRect();
    setDragging(true);
    commitFromClientX(e.clientX);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    commitFromClientX(e.clientX);
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + step;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - step;
        break;
      case 'PageUp':
        next = value + step * 10;
        break;
      case 'PageDown':
        next = value - step * 10;
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    const snapped = snapToStep(next, min, max, step);
    if (snapped !== value) onChange(snapped);
  };

  return (
    <div
      className={cx(styles.root, dragging && styles.dragging, disabled && styles.disabled)}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={display}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.fill} style={{ width: `${percent}%` }} />
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{display}</span>
    </div>
  );
}

export default Slider;
