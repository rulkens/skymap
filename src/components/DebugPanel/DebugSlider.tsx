/**
 * DebugSlider — the shared labelled range-input row used by the DebugPanel's
 * tuning sections (Lensing, Flow).
 *
 * Each of those sections previously carried a byte-identical local `Slider`;
 * this is that row lifted to a single home so the layout — a fixed 90px label, a
 * right-aligned 52px readout, and a flexible range track — lives in one place
 * rather than drifting between copies.
 *
 * The readout is pre-formatted by the caller, so the slider stays agnostic about
 * whether a value reads as an integer, a `toFixed(3)`, or a `42×` multiplier.
 * `onChange` always receives a number (the raw `event.target.value` string is
 * coerced here) so callers never repeat the `Number(...)` dance.
 *
 * Inline monospace styles (no `.module.css`) match the sibling DebugPanel
 * sections; imported directly from this file (no barrel), per the component
 * convention.
 */

import type { ReactElement } from 'react';

export type DebugSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Pre-formatted value readout (e.g. `toFixed(3)` or an integer string). */
  readout: string;
  onChange: (v: number) => void;
};

export function DebugSlider({
  label,
  value,
  min,
  max,
  step,
  readout,
  onChange,
}: DebugSliderProps): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <span style={{ flex: '0 0 90px' }}>{label}</span>
      <span style={{ flex: '0 0 52px', textAlign: 'right', opacity: 0.8 }}>{readout}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: '1 1 auto' }}
      />
    </div>
  );
}
