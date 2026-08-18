/**
 * ParamSlider — one tunable galaxy parameter: the app's `Slider` pill, an ⓘ
 * tip naming the state it writes, and an optional reseed die.
 *
 * The 20 px die slot always renders, even when `onReseed` is absent, so a
 * column of sliders — some seed-linked (irregularity, arm clumping), most
 * not — keeps its pills flush-left instead of the seeded rows jogging
 * narrower than their neighbours (the spike's `hasSeed` slot).
 *
 * Label + value are the `Slider` pill's own; drawing them here too doubles them.
 */
import type { ReactNode } from 'react';
import Slider from '../Slider/Slider';
import CompactInfoTip from '../CompactInfoTip/CompactInfoTip';
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
  /**
   * Dotted store path this slider writes (`fieldTuning.arms.cloud.radialBias`),
   * in the same vocabulary the section copy control keys its payload by.
   * Required so a new slider cannot ship without naming its field, and
   * machine-readable so `sliderStatePaths.test.tsx` can resolve every one
   * against the real state and fail when a field is renamed out from under it.
   */
  readonly path: string;
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
  path,
}: ParamSliderProps): ReactNode {
  return (
    <div className={styles.root}>
      <CompactInfoTip
        label={
          <>
            {info && <span className={styles.tipProse}>{info}</span>}
            <code className={styles.tipPath}>{path}</code>
          </>
        }
        align="start"
      >
        <button type="button" className={styles.infoIcon} aria-label={`About ${label}`}>
          ⓘ
        </button>
      </CompactInfoTip>
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
