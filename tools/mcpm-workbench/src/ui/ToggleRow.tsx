/**
 * ToggleRow — a boolean option as a labelled checkbox row, the same vocabulary
 * the app's panels use (`shared.module.css`). Tool-local like Slider/Toggle,
 * but the classes compose from the app so a look tuned there transfers here.
 *
 * The ⓘ sits OUTSIDE the `<label>`: a label forwards clicks to its control, so
 * a tip button nested inside it would flip the checkbox.
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
    <div className={styles.toggleRow}>
      {info !== undefined && (
        <CompactInfoTip label={info} align="start">
          <button type="button" className={styles.infoIcon} aria-label={`About ${label}`}>
            ⓘ
          </button>
        </CompactInfoTip>
      )}
      <label className={styles.toggleLabel}>
        <span>{label}</span>
        {/* aria-label as well as the label text: the probe selects these by exact
            accessible name, which the wrapping label alone would not pin down. */}
        <input
          type="checkbox"
          className={styles.checkbox}
          aria-label={label}
          checked={on}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    </div>
  );
}

export default ToggleRow;
