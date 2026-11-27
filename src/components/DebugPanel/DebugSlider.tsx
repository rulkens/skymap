/**
 * DebugSlider — one labelled range row for a DebugPanel tuning section.
 *
 * The dev panel's tuning sections (flow, Milky Way) are each a stack of
 * "label / value / range" rows driven from a registry, and they all want the
 * same three-column row. This owns that row once instead of each section
 * carrying its own copy.
 *
 * Deliberately NOT `common/Slider`: that one is the explorer-facing pill with
 * a painted fill bar and pointer-drag maths, sized for the SettingsPanel. The
 * dev panel wants a bare native `<input type=range>` — dense, keyboard- and
 * screen-reader-native for free, and visually consistent with the clip-path
 * inspector's rows.
 *
 * The `readout` is pre-formatted by the caller rather than derived from `step`
 * here: the registries already own each knob's formatting (a rounded count vs
 * four decimals of exposure), and re-deriving it would be a second, quietly
 * different answer.
 */

import type { ReactNode } from 'react';
import DebugInfoTip from './DebugInfoTip';
import styles from './DebugSlider.module.css';

export type DebugSliderProps = {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Pre-formatted value readout (e.g. `toFixed(3)` or an integer string). */
  readonly readout: string;
  readonly onChange: (value: number) => void;
  /** Optional hover tooltip on the whole row. */
  readonly title?: string;
  /** Adds the ⓘ help tip at the row's end, as `DebugOverlayToggles`' rows. */
  readonly info?: string;
  /** A second, one-line label under `label`: what the row tunes, when that changes with the scene. */
  readonly detail?: string;
  readonly disabled?: boolean;
};

function DebugSlider({
  label,
  value,
  min,
  max,
  step,
  readout,
  onChange,
  title,
  info,
  detail,
  disabled,
}: DebugSliderProps): ReactNode {
  const name = detail === undefined ? label : `${label} · ${detail}`;
  return (
    <div className={styles.root} title={title}>
      <span className={styles.label}>
        {label}
        {detail !== undefined && <span className={styles.detail}>{detail}</span>}
      </span>
      <span className={styles.readout}>{readout}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={name}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.range}
      />
      {info !== undefined && <DebugInfoTip label={name} info={info} />}
    </div>
  );
}

export default DebugSlider;
