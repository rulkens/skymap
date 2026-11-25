/**
 * ToggleRow — a boolean option as a pill row in the panel's row chrome. The
 * `<input type="checkbox">` IS the visible pill, the same sliding thumb as the
 * main app's SettingsPanel rows.
 */
import type { ReactNode } from 'react';
import cx from 'classnames';
import PanelRow from '../PanelRow/PanelRow';
import styles from './ToggleRow.module.css';

export type ToggleRowProps = {
  readonly label: string;
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
  readonly info?: string;
  /**
   * A muted trailing note (e.g. "not in small tier") — also mutes the label
   * itself, so the row reads as de-emphasized. Never disables the pill: a
   * source's selection must survive tier switches, so an excluded-at-tier
   * row stays fully toggleable.
   */
  readonly hint?: string;
};

function ToggleRow({ label, on, onChange, info, hint }: ToggleRowProps): ReactNode {
  return (
    <PanelRow info={info} infoName={label}>
      <label className={styles.main}>
        <span className={cx(styles.labelText, hint !== undefined && styles.labelMuted)}>
          {label}
          {hint !== undefined && <span className={styles.hint}> {hint}</span>}
        </span>
        {/* aria-label, not just the wrapping <label>: a wrapping <label> would compute
            an accessible name from ITS OWN text content, which here includes the hint —
            aria-label pins the probe's exact:true role/name selectors to `label` alone. */}
        <input
          type="checkbox"
          className={styles.toggle}
          aria-label={label}
          checked={on}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    </PanelRow>
  );
}

export default ToggleRow;
