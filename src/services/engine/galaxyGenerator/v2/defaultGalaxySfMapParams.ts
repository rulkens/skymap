/** Default shared SF-map switch: on, running the calibrated automaton — see `GalaxySfMapParams`'s header for why this block carries nothing else. */
import type { GalaxySfMapParams } from '../../../../@types/galaxy/GalaxySfMapParams';

export const DEFAULT_GALAXY_SF_MAP_PARAMS: GalaxySfMapParams = {
  enabled: true,
  // Fluid is the default since the 2026-08-05 pivot: the automaton cannot
  // produce coherent walls/filaments (spike verdict, research doc 09), so the
  // advected-density pipeline is the one being calibrated. The automaton
  // stays selectable for comparison.
  generator: 'fluid',
};
