/**
 * ParamSlider — one tunable galaxy parameter: the app's `Slider` pill, plus
 * an optional reseed die.
 *
 * The 20 px die slot always renders, even when `onReseed` is absent, so a
 * column of sliders — some seed-linked (irregularity, arm clumping), most
 * not — keeps its pills flush-left instead of the seeded rows jogging
 * narrower than their neighbours (html:199-208's `hasSeed` slot).
 *
 * Label + value used to be a row this component drew itself; `Slider`
 * already folds both into the pill, so drawing them again here would
 * double them up.
 */
import type { ReactNode } from 'react';
import Slider from '../../../../../src/components/common/Slider/Slider';
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

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onReseed,
}: ParamSliderProps): ReactNode {
  return (
    <div className={styles.root}>
      <div className={styles.main}>
        <Slider
          label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          format={format}
          onChange={onChange}
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
