import { STRUCTURE_IDS } from '../../../data/structure/structureIds';
import { STRUCTURE_MARKER_STYLES } from './structureMarkerStyles';

/** Every category's visibility band — the pass gate asks whether any of them is above zero. */
export const STRUCTURE_VISIBLE_BANDS = STRUCTURE_IDS.map(
  (id) => STRUCTURE_MARKER_STYLES[id].visibleBand,
);
