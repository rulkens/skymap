import { STRUCTURE_IDS_BY_SCALE } from '../../../data/structure/structureIdsByScale';
import { STRUCTURE_MARKER_STYLES } from './structureMarkerStyles';

/** Each scale's category visibility bands — a pass gate asks whether any of its own is above zero. */
export const STRUCTURE_VISIBLE_BANDS_BY_SCALE = {
  cosmic: STRUCTURE_IDS_BY_SCALE.cosmic.map((id) => STRUCTURE_MARKER_STYLES[id].visibleBand),
  milkyWay: STRUCTURE_IDS_BY_SCALE.milkyWay.map((id) => STRUCTURE_MARKER_STYLES[id].visibleBand),
} as const;
