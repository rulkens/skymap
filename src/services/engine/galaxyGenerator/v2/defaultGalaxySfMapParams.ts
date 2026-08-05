/** Default shared SF-map switch: on, running the calibrated automaton — see `GalaxySfMapParams`'s header for why this block carries nothing else. */
import type { GalaxySfMapParams } from '../../../../@types/galaxy/GalaxySfMapParams';

export const DEFAULT_GALAXY_SF_MAP_PARAMS: GalaxySfMapParams = {
  enabled: true,
  // The automaton is the calibrated, shipped look; fluid is the comparison
  // spike (`GalaxySfMapFluidParams`) — defaults to the tuned pipeline so no
  // existing build changes until someone flips the toggle.
  generator: 'automaton',
};
