/**
 * galaxyDustMixture — the dust disc's shared shape (`dustDiscShape`,
 * `dustSigmaR`) and its closed-form face-on column (`dustFaceOnColumn`).
 * There is no longer a GPU mixture built here: the azimuthally-symmetric
 * smooth tier this file used to pack as its own Gaussian components was
 * deleted (the SF map now leads — `dustParticleCloud.ts` carries the
 * galaxy's ENTIRE measured `tau`). What remains anchors that particle
 * cloud's mass budget to the measured disc profile, and feeds
 * `dustLaneFeatures.ts`'s arm-lane amplitude (used to gate where cloud
 * bubbles carve).
 */
import { DISC_SIGMA_RATIOS, DISC_SURFACE_WEIGHTS } from './discSurfaceFit';
import { discLightScaleLength } from '../../../../utils/galaxy/discLightScaleLength';
import type { GalaxyDustParams } from '../../../../@types/galaxy/GalaxyDustParams';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';

/** Exported so `dustParticleCloud.ts` sizes its mass budget off the SAME disc profile rather than re-deriving it. */
export type DustDiscShape = {
  readonly hDust: number;
  readonly sigmaZ: number;
  readonly sigmaRCap: number;
  readonly sumW: number;
};

/**
 * This mixture is flat (grill Q5); the disc itself isn't past warpStartRadius.
 * Capping sigmaR there is a flat-model VALIDITY boundary, not a physical dust
 * truncation — it stops the widest component's 2-sigma tail from reaching into
 * the warped ring band and visibly disagreeing with it. Warped outer dust is
 * deferred to the particle-cloud tier, where ring-placed clouds are affordable.
 * sigmaZ (and so the face-on central tau, which depends only on sigmaZ) is untouched.
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

/**
 * dustFaceOnColumn — the disc's azimuthally-symmetric face-on V-band column
 * Sigma(R), evaluated in closed form from the same four-Gaussian disc fit
 * `dustDiscShape`/`dustSigmaR` describe. Exported so `dustLaneFeatures.ts`
 * can read "how much column exists at this radius" (to redistribute into
 * arm-concentrated lane amplitude — see its own ledger comment) without
 * re-deriving the profile. Carries the FULL `dust.tau`: there is no smooth
 * GPU tier anymore to debit a share against, so this is exactly what
 * `dustParticleCloud.ts` renders, read back in closed form.
 */
export function dustFaceOnColumn(
  radius: number,
  geometry: GalaxyDescription,
  dust: GalaxyDustParams,
): number {
  if (geometry.light.disc <= 0 || dust.tau <= 0) return 0;
  const shape = dustDiscShape(geometry, dust);
  let sigma = 0;
  for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
    const sigmaR = dustSigmaR(i, shape);
    sigma += DISC_SURFACE_WEIGHTS[i]! * Math.exp(-(radius * radius) / (2 * sigmaR * sigmaR));
  }
  return (dust.tau / shape.sumW) * sigma;
}
