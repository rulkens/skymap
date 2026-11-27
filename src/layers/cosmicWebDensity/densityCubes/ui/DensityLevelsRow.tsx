/**
 * DensityLevelsRow — the "Colour by level" debug toggle of one density field, its legend in the ⓘ tip.
 */

import type { ReactElement } from 'react';
import CompactInfoTip from '../../../../../packages/shared/src/components/common/CompactInfoTip/CompactInfoTip';
import { DENSITY_LEVEL_LEGEND } from '../data/densityLevelLegend';
import styles from './DensityLevelsRow.module.css';

export type DensityLevelsRowProps = {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
};

function DensityLevelsRow({ checked, onChange }: DensityLevelsRowProps): ReactElement {
  return (
    <div className={styles.root}>
      <label className={styles.toggle}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>Colour by level</span>
      </label>
      <CompactInfoTip
        align="end"
        label={
          <span className={styles.legend}>
            {DENSITY_LEVEL_LEGEND.map(({ label, color }) => (
              <span key={label} className={styles.entry}>
                <span className={styles.swatch} style={{ background: color }} />
                {label}
              </span>
            ))}
          </span>
        }
      >
        <button type="button" className={styles.infoIcon} aria-label="Level colours">
          ⓘ
        </button>
      </CompactInfoTip>
    </div>
  );
}

export default DensityLevelsRow;
