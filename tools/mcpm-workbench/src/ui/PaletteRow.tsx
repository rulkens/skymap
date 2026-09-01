/**
 * PaletteRow — a labeled palette picker aligned with the ParamSlider/ToggleRow
 * rows around it (same row chrome and label typography).
 */
import type { ReactNode } from 'react';
import type { ScalarFieldPaletteId } from '../../../../src/@types/data/volume/ScalarFieldPaletteId';
import { PaletteSelect } from '../../../../src/components/common/PaletteSelect/PaletteSelect';
import styles from './PaletteRow.module.css';

export type PaletteRowProps = {
  readonly value: ScalarFieldPaletteId;
  readonly onChange: (id: ScalarFieldPaletteId) => void;
};

function PaletteRow({ value, onChange }: PaletteRowProps): ReactNode {
  return (
    <div className={styles.root}>
      <div className={styles.main}>
        <span className={styles.labelText}>palette</span>
        <PaletteSelect value={value} onChange={onChange} />
      </div>
    </div>
  );
}

export default PaletteRow;
