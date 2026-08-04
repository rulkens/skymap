/**
 * ParamSlider — one tunable galaxy parameter: the app's `Slider` pill, plus
 * an optional reseed die.
 *
 * The 20 px die slot always renders, even when `onReseed` is absent, so a
 * column of sliders — some seed-linked (irregularity, arm clumping), most
 * not — keeps its pills flush-left instead of the seeded rows jogging
 * narrower than their neighbours (the spike's `hasSeed` slot).
 *
 * Label + value used to be a row this component drew itself; `Slider`
 * already folds both into the pill, so drawing them again here would
 * double them up.
 */
import type { ReactNode } from 'react';
import Slider from '../../../../../src/components/common/Slider/Slider';
import CompactInfoTip from '../../../../../src/components/common/CompactInfoTip/CompactInfoTip';
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
  /** Hover/focus explainer, revealed from a ⓘ affordance ahead of the pill. */
  readonly info?: string;
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
  info,
}: ParamSliderProps): ReactNode {
  return (
    <div className={styles.root}>
      {info && (
        <CompactInfoTip label={info} align="start">
          <button type="button" className={styles.infoIcon} aria-label={`About ${label}`}>
            ⓘ
          </button>
        </CompactInfoTip>
      )}
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
