/**
 * Math-derivation exception (comments.md): the dust disc's shared shape
 * (`dustDiscShape`) and its closed-form face-on column
 * (`dustFaceOnColumn`). No GPU mixture is built here: the ISM map leads
 * (`dustParticleCloud.ts` carries the galaxy's entire measured `tau`); this
 * module only anchors that particle cloud's mass budget to the measured
 * disc profile, and feeds `dustLaneFeatures.ts`'s arm-lane amplitude.
 */
import { DISC_SURFACE_WEIGHTS } from '../../mixture/data/discSurfaceFit';
import { discLightScaleLength } from '../../mixture/utils/discLightScaleLength';
import type { GalaxyDustParams } from '../@types/GalaxyDustParams';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import { DustDiscShape } from '../@types/DustDiscShape';

/**
 * Flat model (grill Q5) — the disc itself isn't past `warpStartRadius`.
 * Capping sigmaR there is a validity boundary, not a physical truncation: it
 * stops the widest component's 2-sigma tail from reaching into the warped
 * ring band. Warped outer dust is deferred to the particle-cloud tier.
 * sigmaZ (and so face-on central tau, which depends only on sigmaZ) is
 * untouched.
 */
export function dustDiscShape(geometry: GalaxyDescription, dust: GalaxyDustParams): DustDiscShape {
  return {
    hDust: dust.scaleLenRatio * discLightScaleLength(geometry),
    sigmaZ: dust.heightRatio * geometry.diskHeight,
    sigmaRCap: geometry.warpStrength > 0 ? geometry.warpStartRadius * 0.5 : Infinity,
    sumW: DISC_SURFACE_WEIGHTS.reduce((sum, w) => sum + w, 0),
  };
}
