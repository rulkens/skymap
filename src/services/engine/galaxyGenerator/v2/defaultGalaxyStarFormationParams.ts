import type { GalaxyStarFormationParams } from '../../../../@types/galaxy/GalaxyStarFormationParams';

// ×measured-default scaler, so 1.0 is the literature value the rate
// `sfEventCatalog.ts`'s RATE_SCALE was calibrated against. This IS
// `GalaxyFieldTuning.starFormation`'s default section (`galaxyFieldMixture.ts`'s
// DEFAULT_GALAXY_FIELD_TUNING references this object directly).
export const DEFAULT_GALAXY_STAR_FORMATION_PARAMS: GalaxyStarFormationParams = {
  sfActivity: 1,
};
