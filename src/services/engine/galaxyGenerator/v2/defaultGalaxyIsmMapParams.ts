/** Default shared ISM-map switch — see `GalaxyIsmMapParams`'s header for why this block carries nothing else. */
import type { GalaxyIsmMapParams } from '../../../../@types/galaxy/GalaxyIsmMapParams';

export const DEFAULT_GALAXY_ISM_MAP_PARAMS: GalaxyIsmMapParams = {
  // Fluid is the only generator; 'none' turns the whole tier off.
  generator: 'fluid',
};
