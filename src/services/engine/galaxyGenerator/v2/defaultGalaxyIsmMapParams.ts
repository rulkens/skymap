/** Default shared ISM-map switch — see `GalaxyIsmMapParams`'s header for why this block carries nothing else. */
import type { GalaxyIsmMapParams } from '../../../../@types/galaxy/GalaxyIsmMapParams';

export const DEFAULT_GALAXY_ISM_MAP_PARAMS: GalaxyIsmMapParams = {
  // Fluid is the default since the 2026-08-05 pivot: the automaton cannot
  // produce coherent walls/filaments (spike verdict, research doc 09), so the
  // advected-density pipeline is the one being calibrated. The automaton
  // stays selectable for comparison; 'none' turns the whole tier off.
  generator: 'fluid',
};
