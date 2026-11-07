/** The antique look's live knobs: their defaults, and the plate rows the panel can switch off. */

import type { AntiqueTuning } from '../../@types/settings/AntiqueTuning';
import type { AntiquePlateRow } from '../../@types/rendering/AntiquePlateRow';
import { ANTIQUE_PLATE_LIGHT_ELEVATION_DEG } from './antiqueRelief';

/** A row's index is its `HIDE_*` bit in fragment.wesl: reorder both together. */
export const ANTIQUE_PLATE_ROWS: readonly {
  readonly key: AntiquePlateRow;
  readonly label: string;
}[] = [
  { key: 'rulings', label: 'Rulings' },
  { key: 'lines', label: 'Constellation and orbit lines' },
  { key: 'figures', label: 'Constellation figures' },
  { key: 'glyphs', label: 'Star glyphs' },
  { key: 'web', label: 'Cosmic web chart' },
  { key: 'galaxies', label: 'Galaxy engraving' },
  { key: 'hatching', label: 'Body hatching' },
  { key: 'relief', label: 'Ground relief' },
  { key: 'geography', label: 'Earth geography' },
];

export const ANTIQUE_TUNING_DEFAULTS: AntiqueTuning = {
  hatchUnits: 4.2,
  hatchAngleDeg: 0,
  washGain: 1,
  inkGain: 1,
  lineInk: 0.6,
  borderWash: 0.6,
  paperTint: '#ffffff',
  reliefLightDeg: ANTIQUE_PLATE_LIGHT_ELEVATION_DEG,
  skyRulings: 'orientation',
  rows: Object.fromEntries(ANTIQUE_PLATE_ROWS.map(({ key }) => [key, true])) as Record<
    AntiquePlateRow,
    boolean
  >,
};
