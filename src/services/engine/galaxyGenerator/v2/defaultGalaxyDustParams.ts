import type { GalaxyDustParams } from '../../../../@types/galaxy/GalaxyDustParams';
import { DEFAULT_GALAXY_DUST_CLOUD_PARAMS } from './defaultGalaxyDustCloudParams';

// Mid-range of the measured distributions (see GalaxyDustParams' docblock),
// except where noted. This IS `GalaxyFieldTuning.dust`'s default section
// (`galaxyFieldMixture.ts`'s DEFAULT_GALAXY_FIELD_TUNING references this
// object directly rather than restating it) — the sole source for the
// tier's shape AND its `enabled` master toggle.
//
// tau and rV are both tuned past their measured values ON PURPOSE, and the
// direction is the same for both: measured tau (0.5-1), carried entirely by
// the particle cloud (see GalaxyDustCloudParams' header), still reads thin
// against the disc, and R_V 3.1 (the diffuse-ISM value) reddens too little
// to see until tau is high. Lower R_V steepens the extinction curve, so the
// reddening arrives at a tau the image can actually carry. Photometric
// fidelity is not what this field is for; matching what a telescope's eye sees
// is.
export const DEFAULT_GALAXY_DUST_PARAMS: GalaxyDustParams = {
  enabled: true,
  tau: 1.25,
  scaleLenRatio: 1.5,
  heightRatio: 0.4,
  rV: 2.3,
  cloud: DEFAULT_GALAXY_DUST_CLOUD_PARAMS,
};
