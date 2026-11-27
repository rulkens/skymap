/**
 * PanelRow — the one row chrome of the workbench sidebars, laid on the panel
 * grid's label, control and ⓘ columns. With a label and children, the label
 * wraps the control; a label alone is a readout; children alone span the
 * label and control columns. Tab order runs control, then its ⓘ.
 */
import type { ReactNode } from 'react';
import CompactInfoTip from '../../../../../shared/src/components/common/CompactInfoTip/CompactInfoTip';
import styles from './PanelRow.module.css';

export type PanelRowProps = {
  readonly label?: ReactNode;
  readonly info?: ReactNode;
  /** Names the ⓘ; defaults to `label` when that is a string. */
  readonly infoName?: string;
  readonly children?: ReactNode;
};

function PanelRow({
  label,
  info,
  infoName = typeof label === 'string' ? label : undefined,
  children,
}: PanelRowProps): ReactNode {
  return (
    <div className={styles.root}>
      {label !== undefined && children !== undefined ? (
        <label className={styles.labelled}>
          <span className={styles.labelText}>{label}</span>
          <span className={styles.control}>{children}</span>
        </label>
      ) : label !== undefined ? (
        <span className={styles.readout}>{label}</span>
      ) : (
        <div className={styles.wide}>{children}</div>
      )}
      {info !== undefined && (
        <span className={styles.info}>
          <CompactInfoTip label={info} align="end">
            <button type="button" className={styles.infoIcon} aria-label={`About ${infoName}`}>
              ⓘ
            </button>
          </CompactInfoTip>
        </span>
      )}
    </div>
  );
}

export default PanelRow;
