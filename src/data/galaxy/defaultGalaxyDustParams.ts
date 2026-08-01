import type { GalaxyDustParams } from '../../@types/galaxy/GalaxyDustParams';
import { DEFAULT_GALAXY_DUST_NETWORK_PARAMS } from './defaultGalaxyDustNetworkParams';

// Mid-range of the measured distributions (see GalaxyDustParams' docblock).
// Applied at point of use when a galaxy's params carry no `dust` section.
export const DEFAULT_GALAXY_DUST_PARAMS: GalaxyDustParams = {
  tau: 0.6,
  scaleLenRatio: 1.5,
  heightRatio: 0.4,
  network: DEFAULT_GALAXY_DUST_NETWORK_PARAMS,
};
