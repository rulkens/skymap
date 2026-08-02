import type { GalaxyStarFormationParams } from '../../@types/galaxy/GalaxyStarFormationParams';

// Both knobs are ×measured-default scalers, so 1.0 is the literature value:
// the rate `sfEventCatalog.ts`'s RATE_SCALE was calibrated against, and the
// unmodified NGC 628 bubble-radius law. Applied at point of use when a
// galaxy's params carry no `starFormation` section.
export const DEFAULT_GALAXY_STAR_FORMATION_PARAMS: GalaxyStarFormationParams = {
  sfActivity: 1,
  bubbleScale: 1,
};
