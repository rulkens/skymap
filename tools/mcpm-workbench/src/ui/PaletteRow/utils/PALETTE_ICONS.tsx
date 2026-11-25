import type { ReactNode } from 'react';
import type { ScalarFieldPaletteId } from '../../../../../../src/@types/data/volume/ScalarFieldPaletteId';
import {
  buildPaletteLut,
  PALETTE_IDS,
} from '../../../../../../src/data/volume/scalarFieldPalettes';
import PaletteSwatch from '../../PaletteSwatch/PaletteSwatch';
import { paletteGradientStops } from '../../PaletteSwatch/utils/paletteGradientStops';

export const PALETTE_ICONS = Object.fromEntries(
  PALETTE_IDS.map((id) => [
    id,
    <PaletteSwatch size={12} stops={paletteGradientStops(buildPaletteLut(id))} />,
  ]),
) as Readonly<Record<ScalarFieldPaletteId, ReactNode>>;
