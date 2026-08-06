/** Default shared SF-map switch — see `GalaxySfMapParams`'s header for why this block carries nothing else. */
import type { GalaxySfMapParams } from '../../../../@types/galaxy/GalaxyIsmMapParams';

export const DEFAULT_GALAXY_SF_MAP_PARAMS: GalaxySfMapParams = {
  // Fluid is the default since the 2026-08-05 pivot: the automaton cannot
  // produce coherent walls/filaments (spike verdict, research doc 09), so the
  // advected-density pipeline is the one being calibrated. The automaton
  // stays selectable for comparison; 'none' turns the whole tier off.
  generator: 'fluid',
};
