/** VolumeFieldDefaults — a field's look on first registration: presentation, so it sits on the field's
 *  source row (`layers/cosmicWebDensity/sources/`), never in the data file. */

import type { ScalarFieldPaletteId } from '../../../../packages/shared/src/@types/data/volume/ScalarFieldPaletteId';

export type VolumeFieldDefaults = {
  paletteId: ScalarFieldPaletteId;
  contrast: number;
  /** Contrast window centre in LUT space [0, 1], from the data and palette, not a knob: 0.5 for a
   *  divergent palette (zero at mid-range), 0 for a sequential one (voids at t = 0). */
  contrastCenter: number;
  densityScale: number;
  /** Alpha smoothstep, inner opaque to outer clear, in local distance from the centre with the
   *  inscribed sphere at 1. Corners sit at √3, so { 2, 2 } is "no envelope" without a branch. */
  envelope: {
    inner: number;
    outer: number;
  };
  exposure: number;
  trim: number;
};
