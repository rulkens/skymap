import type { GalaxyDustParams } from '../../../../@types/galaxy/GalaxyDustParams';
import { DEFAULT_GALAXY_DUST_CLOUD_PARAMS } from './defaultGalaxyDustCloudParams';

// Mid-range of the measured distributions (see GalaxyDustParams' docblock),
// except where noted. This IS `GalaxyFieldTuning.dust`'s default section —
// `galaxyFieldMixture.ts` references this object directly.
//
// tau and rV are both tuned past their measured values on purpose: measured
// tau (0.5-1) still reads thin against the disc, and R_V 3.1 (diffuse-ISM)
// reddens too little to see until tau is high. Lower R_V steepens the
// extinction curve so reddening arrives at a tau the image can carry —
// photometric fidelity is not the goal, matching what a telescope's eye
// sees is.
export const DEFAULT_GALAXY_DUST_PARAMS: GalaxyDustParams = {
  enabled: true,
  tau: 1.25,
  scaleLenRatio: 1.5,
  // Exception to the "mid-range" rule above: ~100-134 pc dust scale height
  // vs ~314 pc stellar sigma (Drimmel & Spergel 2001; Misiriotis et al.
  // 2006). The app renders exactly one galaxy, so this scene-wide default IS
  // the Milky Way's measured value.
  heightRatio: 0.35,
  rV: 2.3,
  redness: 1,
  cloud: DEFAULT_GALAXY_DUST_CLOUD_PARAMS,
};
