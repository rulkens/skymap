/**
 * Math-derivation exception (comments.md): the dust disc's shared shape
 * (`dustDiscShape`, `dustSigmaR`) and its closed-form face-on column
 * (`dustFaceOnColumn`). No GPU mixture is built here: the ISM map leads
 * (`dustParticleCloud.ts` carries the galaxy's entire measured `tau`); this
 * module only anchors that particle cloud's mass budget to the measured
 * disc profile, and feeds `dustLaneFeatures.ts`'s arm-lane amplitude.
 */
import { DISC_SIGMA_RATIOS, DISC_SURFACE_WEIGHTS } from './discSurfaceFit';
import { discLightScaleLength } from '../../../../utils/galaxy/discLightScaleLength';
import type { GalaxyDustParams } from '../../../../@types/galaxy/GalaxyDustParams';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';

/** Exported so `dustParticleCloud.ts` sizes its mass budget off the SAME disc profile rather than re-deriving it. */
type DustDiscShape = {
  readonly hDust: number;
  readonly sigmaZ: number;
  readonly sigmaRCap: number;
  readonly sumW: number;
};

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

/** Component i's radial sigma, capped at the flat-model validity boundary — shared by `dustFaceOnColumn` below and `dustParticleCloud.ts`. */
export function dustSigmaR(i: number, shape: DustDiscShape): number {
  return Math.min(DISC_SIGMA_RATIOS[i]! * shape.hDust, shape.sigmaRCap);
}
