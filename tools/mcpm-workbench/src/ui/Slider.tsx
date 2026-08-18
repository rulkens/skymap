/**
 * Slider — one tunable numeric parameter. Presentational: takes a label,
 * range, current value, and an onChange callback — no store access, so
 * ControlsPanel/GridBoxPanel can point it at any slice field. Tool-local
 * (spec §10) rather than promoted to `src/components/common/` — that
 * promotion is a standing backlog item, not this task's business.
 */
import type { ReactNode } from 'react';

export type SliderProps = {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
  readonly format?: (value: number) => string;
};

function Slider({ label, value, min, max, step, onChange, format }: SliderProps): ReactNode {
  const shown = format ? format(value) : String(value);
  return (
    <label style={{ display: 'block', margin: '0 0 var(--space-4)' }}>
      <span
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-family-mono)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-fg-muted)',
          letterSpacing: 'var(--letter-spacing-tight)',
        }}
      >
        <span>{label}</span>
        <span style={{ color: 'var(--color-fg-base)' }}>{shown}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--color-accent)' }}
      />
    </label>
  );
}

export default Slider;
