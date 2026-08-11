/**
 * TypePicker — the Hubble-sequence type chips (E0–E7 / S0 / Irr / Sa–Sc /
 * SBa–SBc). Four rows, ported verbatim from the spike's
 * `typesE`/`typesS0`/`typesIrr`/`typesSpiral`/`typesBarred` lists: elliptical
 * (8, wraps), lenticular + irregular side by side (1 each), spiral (3),
 * barred spiral (3).
 *
 * Purely presentational — the parent owns what a click means (`onSelect`
 * is handed the raw type string; ControlsPanel dispatches the Hubble-stage
 * patch).
 */
import type { ReactNode } from 'react';
import cx from 'classnames';
import styles from './TypePicker.module.css';

export type TypePickerProps = {
  readonly activeType: string;
  readonly onSelect: (type: string) => void;
};

const ELLIPTICAL: readonly string[] = ['E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7'];
const SPIRAL: readonly string[] = ['Sa', 'Sb', 'Sc'];
const BARRED: readonly string[] = ['SBa', 'SBb', 'SBc'];

function TypePicker({ activeType, onSelect }: TypePickerProps): ReactNode {
  const chip = (type: string): ReactNode => (
    <button
      key={type}
      type="button"
      className={cx(styles.chip, activeType === type && styles.chipActive)}
      onClick={() => onSelect(type)}
    >
      {type}
    </button>
  );

  return (
    <div className={styles.root}>
      <div className={styles.rowLabel}>
        Elliptical <span className={styles.rowHint}>E0 (round) → E7 (flattened)</span>
      </div>
      <div className={styles.ellipticalRow}>{ELLIPTICAL.map(chip)}</div>

      <div className={styles.pairGrid}>
        <div>
          <div className={styles.rowLabel}>Lenticular</div>
          <div className={styles.chipRow}>{chip('S0')}</div>
        </div>
        <div>
          <div className={styles.rowLabel}>Irregular</div>
          <div className={styles.chipRow}>{chip('Irr')}</div>
        </div>
      </div>

      <div className={styles.rowLabel}>
        Spiral <span className={styles.rowHint}>Sa (tight) → Sc (loose)</span>
      </div>
      <div className={styles.spiralRow}>{SPIRAL.map(chip)}</div>

      <div className={styles.rowLabel}>Barred spiral</div>
      <div className={styles.barredRow}>{BARRED.map(chip)}</div>
    </div>
  );
}

export default TypePicker;
