/** PaletteRow — a labelled palette picker in the panel's row chrome. */
import type { ReactNode } from 'react';
import type { ScalarFieldPaletteId } from '../../../../../../src/@types/data/volume/ScalarFieldPaletteId';
import { PALETTE_IDS } from '../../../../../../src/data/volume/scalarFieldPalettes';
import PanelRow from '../../panel/PanelRow/PanelRow';
import Select from '../../panel/Select/Select';
import { PALETTE_ICONS } from './data/paletteIcons.constant';

export type PaletteRowProps = {
  readonly value: ScalarFieldPaletteId;
  readonly onChange: (id: ScalarFieldPaletteId) => void;
  readonly info?: string;
};

function PaletteRow({ value, onChange, info }: PaletteRowProps): ReactNode {
  return (
    <PanelRow label="palette" info={info}>
      <Select
        value={value}
        options={PALETTE_IDS}
        icons={PALETTE_ICONS}
        pickerOnlyIcons
        onChange={onChange}
      />
    </PanelRow>
  );
}

export default PaletteRow;
