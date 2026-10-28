import type { SkyGridFrameSpec } from '../@types/SkyGridFrameSpec';
import { ECLIPTIC_FRAME } from '../../../data/bodies/orbitPlaneFrames';
import { GAL_TO_EQ_MATRIX, SG_TO_EQ_MATRIX } from '../../../data/superGalacticTransform';
import { mat3FromColumns } from '../../../utils/math/mat3FromColumns';

/**
 * The grids in shader slot order. The four hues stay apart so crossing grids
 * read as different systems.
 */
export const SKY_GRID_FRAMES: readonly SkyGridFrameSpec[] = [
  { frame: 'equatorial', toWorld: [1, 0, 0, 0, 1, 0, 0, 0, 1], color: [0.35, 0.55, 1.0] },
  {
    frame: 'ecliptic',
    toWorld: mat3FromColumns(ECLIPTIC_FRAME.xAxis, ECLIPTIC_FRAME.yAxis, ECLIPTIC_FRAME.normal),
    color: [1.0, 0.8, 0.3],
  },
  { frame: 'galactic', toWorld: GAL_TO_EQ_MATRIX, color: [1.0, 0.4, 0.55] },
  { frame: 'supergalactic', toWorld: SG_TO_EQ_MATRIX, color: [0.4, 0.95, 0.6] },
];
