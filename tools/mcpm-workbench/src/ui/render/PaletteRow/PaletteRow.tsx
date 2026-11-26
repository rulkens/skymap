/** PaletteRow — a labelled palette picker in the panel's row chrome. */
import type { ReactNode } from 'react';
import type { ScalarFieldPaletteId } from '../../../../../../packages/shared/src/@types/data/volume/ScalarFieldPaletteId';
import { PALETTE_IDS } from '../../../../../../packages/shared/src/data/volume/scalarFieldPalettes';
import PanelRow from '../../panel/PanelRow/PanelRow';
import Select from '../../../../../../src/components/common/Select/Select';
import { PALETTE_ICONS } from './data/paletteIcons.constant';
import { PALETTE_INFO } from './data/paletteInfo.constant';

export type PaletteRowProps = {
  readonly value: ScalarFieldPaletteId;
  readonly onChange: (id: ScalarFieldPaletteId) => void;
};

function PaletteRow({ value, onChange }: PaletteRowProps): ReactNode {
  return (
    <PanelRow label="palette" info={PALETTE_INFO}>
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
