/**
 * PanelRow — the workbench panel's labelled-control row, aligned with the
 * ParamSlider rows (same ⓘ slot, main column and trailing slot). The ⓘ stays
 * outside the `<label>`: a label forwards clicks to its control.
 */
import type { ReactNode } from 'react';
import CompactInfoTip from '../../../../../src/components/common/CompactInfoTip/CompactInfoTip';
import styles from './PanelRow.module.css';

export type PanelRowProps = {
  readonly label: string;
  readonly info?: string;
  readonly children: ReactNode;
};

function PanelRow({ label, info, children }: PanelRowProps): ReactNode {
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
        {children}
      </label>
      <div className={styles.seedSlot} />
    </div>
  );
}

export default PanelRow;
