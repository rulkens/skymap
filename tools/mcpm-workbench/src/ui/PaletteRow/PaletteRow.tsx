/** PaletteRow — a labelled palette picker in the panel's row chrome. */
import type { ReactNode } from 'react';
import type { ScalarFieldPaletteId } from '../../../../../src/@types/data/volume/ScalarFieldPaletteId';
import { PaletteSelect } from '../../../../../src/components/common/PaletteSelect/PaletteSelect';
import PanelRow from '../PanelRow/PanelRow';
import styles from './PaletteRow.module.css';

export type PaletteRowProps = {
  readonly value: ScalarFieldPaletteId;
  readonly onChange: (id: ScalarFieldPaletteId) => void;
  readonly info?: string;
};

function PaletteRow({ value, onChange, info }: PaletteRowProps): ReactNode {
  return (
    <PanelRow label="palette" info={info}>
      <PaletteSelect className={styles.select} value={value} onChange={onChange} />
    </PanelRow>
  );
}

export default PaletteRow;
