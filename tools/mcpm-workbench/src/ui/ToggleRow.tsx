/**
 * ToggleRow — a boolean option as a pill row, aligned with the ParamSlider
 * rows above it (same ⓘ slot, main column, 20px trailing spacer). The
 * `<input type="checkbox">` IS the visible pill — same iOS-style sliding
 * thumb as the main app's SettingsPanel rows. The ⓘ stays OUTSIDE the
 * `<label>` — a label forwards clicks, so a tip button inside it would flip
 * the checkbox.
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
        {/* aria-label, not just the wrapping <label>: a wrapping <label> would compute
            an accessible name from ITS OWN text content, which here is just the label
            span — aria-label pins the probe's exact:true role/name selectors to
            `label` alone regardless of what markup sits alongside the input. */}
        <input
          type="checkbox"
          className={styles.toggle}
          aria-label={label}
          checked={on}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
      <div className={styles.seedSlot} />
    </div>
  );
}

export default ToggleRow;
