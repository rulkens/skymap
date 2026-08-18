/**
 * ToggleRow — a boolean option as a pill row, aligned with the ParamSlider
 * rows above it (same ⓘ slot, main column, 20px trailing spacer).
 *
 * A real hidden `<input type="checkbox">` still backs the pill (NOT
 * display:none, which drops it from the accessibility tree) so the probe's
 * role/name selector still finds it; the pill is styled via
 * `input:checked + .statePill`. The ⓘ stays OUTSIDE the `<label>` — a label
 * forwards clicks, so a tip button inside it would flip the checkbox.
 */
import type { ReactNode } from 'react';
import CompactInfoTip from '../../../../src/components/common/CompactInfoTip/CompactInfoTip';
import styles from './ToggleRow.module.css';

export type ToggleRowProps = {
  readonly label: string;
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
  readonly info?: string;
};

function ToggleRow({ label, on, onChange, info }: ToggleRowProps): ReactNode {
  return (
    <div className={styles.root}>
      {info !== undefined && (
        <CompactInfoTip label={info} align="start">
          <button type="button" className={styles.infoIcon} aria-label={`About ${label}`}>
            ⓘ
          </button>
        </CompactInfoTip>
      )}
      <label className={styles.main}>
        <span className={styles.labelText}>{label}</span>
        {/* aria-label, not just the wrapping <label>: the state pill below is INSIDE that
            label, so its computed accessible name is "{label} on/off" — aria-label is what
            pins the probe's exact:true role/name selectors to `label` alone. Do not delete
            this thinking a wrapping <label> already supplies the name; it supplies a
            DIFFERENT one. */}
        <input
          type="checkbox"
          className={styles.hiddenCheckbox}
          aria-label={label}
          checked={on}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className={styles.statePill}>{on ? 'on' : 'off'}</span>
      </label>
      <div className={styles.seedSlot} />
    </div>
  );
}

export default ToggleRow;
