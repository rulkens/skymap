import { STRUCTURE_IDS_BY_SLAB } from '../../../data/structure/structureIdsBySlab';
import { STRUCTURE_MARKER_STYLES } from './structureMarkerStyles';

/** Each slab's category visibility bands — a pass gate asks whether any of its own is above zero. */
export const STRUCTURE_VISIBLE_BANDS_BY_SLAB = {
  cosmo: STRUCTURE_IDS_BY_SLAB.cosmo.map((id) => STRUCTURE_MARKER_STYLES[id].visibleBand),
  near0: STRUCTURE_IDS_BY_SLAB.near0.map((id) => STRUCTURE_MARKER_STYLES[id].visibleBand),
} as const;
