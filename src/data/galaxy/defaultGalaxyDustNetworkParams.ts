import type { GalaxyDustNetworkParams } from '../../@types/galaxy/GalaxyDustNetworkParams';

// Deliberately conservative (build-up-slowly instruction): masters sit
// mid-to-low in their measured ranges rather than centred, and every refiner
// starts at its literature value (1.0, or 0.5 for the 0..1 rim knob).
export const DEFAULT_GALAXY_DUST_NETWORK_PARAMS: GalaxyDustNetworkParams = {
  armContrast: 3,
  sfActivity: 1,
  texture: 0.35,
  spurStrength: 0.6,
  laneWidth: 1,
  laneOffset: 1,
  spurSpacing: 1,
  spurLength: 1,
  bubbleScale: 1,
  bubbleRimStrength: 0.5,
  beadShare: 0.5,
};
