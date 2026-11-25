/**
 * PanelRow — the one row chrome of the workbench panel: content, then an ⓘ
 * column at the end that every row reserves, so controls end on one line and
 * labels start on another. Tab order runs control, then its ⓘ. With a label
 * and children, the label wraps the control; a label alone is a readout.
 */
import type { ReactNode } from 'react';
import CompactInfoTip from '../../../../../src/components/common/CompactInfoTip/CompactInfoTip';
import styles from './PanelRow.module.css';

export type PanelRowProps = {
  readonly label?: string;
  readonly info?: ReactNode;
  /** Names the ⓘ; defaults to `label`. For controls that draw their own label. */
  readonly infoName?: string;
  readonly children?: ReactNode;
};

function PanelRow({ label, info, infoName = label, children }: PanelRowProps): ReactNode {
  const labelText = label !== undefined && (
    <span className={children === undefined ? styles.readout : styles.labelText}>{label}</span>
  );
  return (
    <div className={styles.root}>
      {label !== undefined && children !== undefined ? (
        <label className={styles.main}>
          {labelText}
          {children}
        </label>
      ) : (
        <div className={styles.main}>
          {labelText}
          {children}
        </div>
      )}
      <div className={styles.infoSlot}>
        {info !== undefined && (
          <CompactInfoTip label={info} align="end">
            <button type="button" className={styles.infoIcon} aria-label={`About ${infoName}`}>
              ⓘ
            </button>
          </CompactInfoTip>
        )}
      </div>
    </div>
  );
}

export default PanelRow;
