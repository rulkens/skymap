/**
 * Slider — one tunable parameter, rendered from a SliderSpec.
 *
 * Presentational: it takes a spec (label/range/step/format), the current value,
 * and an onChange callback — no store access. The control panel maps each of a
 * visualization's `paramSpecs` to one of these, so every layer's controls share
 * one code path and one look. The row mirrors the DebugPanel/spike idiom: an
 * uppercase label with a live formatted readout, above a full-width range input
 * tinted with the shared accent colour.
 */
import type { ReactNode } from 'react';
import type { SliderSpec } from '../../../@types/visualizations/SliderSpec';
import styles from './Slider.module.css';

export type SliderProps = {
  readonly spec: SliderSpec;
  readonly value: number;
  readonly onChange: (value: number) => void;
};

function Slider({ spec, value, onChange }: SliderProps): ReactNode {
  const shown = spec.format ? spec.format(value) : String(value);
  return (
    <label className={styles.row}>
      <span className={styles.head}>
        <span className={styles.label}>{spec.label}</span>
        <span className={styles.value}>{shown}</span>
      </span>
      <input
        className={styles.range}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

export default Slider;
