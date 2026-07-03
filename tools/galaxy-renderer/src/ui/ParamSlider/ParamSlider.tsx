/**
 * ParamSlider — one tunable galaxy parameter: label, mono readout, range
 * input, and an optional reseed die.
 *
 * The 20 px die slot always renders, even when `onReseed` is absent, so a
 * column of sliders — some seed-linked (irregularity, arm clumping), most
 * not — keeps its range inputs flush-left instead of the seeded rows
 * jogging narrower than their neighbours (html:199-208's `hasSeed` slot).
 */
import type { ReactNode } from 'react';
import styles from './ParamSlider.module.css';

export type ParamSliderProps = {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format?: (value: number) => string;
  readonly onChange: (value: number) => void;
  readonly onReseed?: () => void;
};

const defaultFormat = (value: number): string => value.toFixed(2);

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  format = defaultFormat,
  onChange,
  onReseed,
}: ParamSliderProps): ReactNode {
  return (
    <div className={styles.root}>
      <div className={styles.main}>
        <div className={styles.head}>
          <span className={styles.label}>{label}</span>
          <span className={styles.value}>{format(value)}</span>
        </div>
        <input
          type="range"
          className={styles.range}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </div>
      <div className={styles.seedSlot}>
        {onReseed && (
          <button
            type="button"
            className={styles.seedButton}
            onClick={onReseed}
            title="reroll this noise"
            aria-label={`Reroll ${label} noise`}
          >
            🎲
          </button>
        )}
      </div>
    </div>
  );
}

export default ParamSlider;
