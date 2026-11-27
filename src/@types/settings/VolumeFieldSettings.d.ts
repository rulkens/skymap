/** VolumeFieldSettings — one scalar-volume field's runtime knobs, keyed by field id in the density
 *  settings items; `enabled` (DataItemSettings) is what the renderer's `hasActiveFields` reads. */

import type { DataItemSettings } from './DataItemSettings';
import type { ScalarFieldPaletteId } from '../../../packages/shared/src/@types/data/volume/ScalarFieldPaletteId';

export type VolumeFieldSettings = DataItemSettings & {
  /** Linear mix-in weight, [0, 1]. */
  intensity: number;
  /** Deadband width (`applyContrastWindow`, `scalarVolume/transfer.wesl`); 1 = identity. */
  contrast: number;
  densityScale: number;
  paletteId: ScalarFieldPaletteId;
  /** Extra low-end cut above the contrast deadband, [0, 0.95]: a fraction of the surviving range. */
  trim: number;
  /** HDR gain 1 + smoothstep(0.5, 1, dev) · (exposure − 1): mid-tones stay LDR, peaks blow out. */
  exposure: number;
  /** Debug view: shade each march step by the volume level it read. */
  showLevels: boolean;
};
