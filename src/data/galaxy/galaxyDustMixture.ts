/**
 * buildGalaxyDustMixture — dust as an ABSORPTION mixture: pushDisc's own
 * four-Gaussian disc fit, evaluated at the dust disc's own scale length,
 * amplitude the central V-band extinction density (not an emissivity).
 * Measured anchors, cited in full on `GalaxyDustParams`: scale-length ratio
 * 1.4-1.75, height ratio 0.25-0.75, central face-on tau_V 0.5-1.
 */
import { DISC_SIGMA_RATIOS, DISC_SURFACE_WEIGHTS } from './discSurfaceFit';
import { discLightScaleLength } from '../../utils/galaxy/discLightScaleLength';
import { dustExtinctionRgb } from '../../utils/galaxy/dustExtinctionRgb';
import type { GalaxyDustParams } from '../../@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldComponent } from '../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';

const TAU_ROOT = Math.sqrt(2 * Math.PI);
const ORIGIN: readonly [number, number, number] = [0, 0, 0];

/** Exported so `dustParticleCloud.ts` sizes its mass budget off the SAME disc profile rather than re-deriving it. */
export type DustDiscShape = {
  readonly hDust: number;
  readonly sigmaZ: number;
  readonly sigmaRCap: number;
  readonly sumW: number;
};

/**
 * `dust.cloud.share`, clamped to a valid probability: the ledger below splits
 * one tau budget two ways (particles / smooth field) and the two must never
 * sum past the measured total.
 */
export function clampedDustCloudShare(dust: GalaxyDustParams): number {
  return Math.min(1, Math.max(0, dust.cloud.share));
}

/**
 * This mixture is flat (grill Q5); the disc itself isn't past warpStartRadius.
 * Capping sigmaR there is a flat-model VALIDITY boundary, not a physical dust
 * truncation — it stops the widest component's 2-sigma tail from reaching into
 * the warped ring band and visibly disagreeing with it. Warped outer dust is
 * deferred to the particle-cloud tier, where ring-placed clouds are affordable.
 * sigmaZ (and so the face-on central tau, which depends only on sigmaZ) is untouched.
 */
export function dustDiscShape(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
): DustDiscShape {
  return {
    hDust: dust.scaleLenRatio * discLightScaleLength(geometry),
    sigmaZ: dust.heightRatio * geometry.diskHeight,
    sigmaRCap: geometry.warpStrength > 0 ? geometry.warpStartRadius * 0.5 : Infinity,
    sumW: DISC_SURFACE_WEIGHTS.reduce((sum, w) => sum + w, 0),
  };
}

/** Component i's radial sigma, capped at the flat-model validity boundary — shared by the mixture builder, `dustFaceOnColumn` below, and `dustParticleCloud.ts`. */
export function dustSigmaR(i: number, shape: DustDiscShape): number {
  return Math.min(DISC_SIGMA_RATIOS[i]! * shape.hDust, shape.sigmaRCap);
}

/**
 * dustFaceOnColumn — the global lane's azimuthally-symmetric face-on V-band
 * column Sigma(R): the same sum-of-Gaussians `buildGalaxyDustMixture` packs
 * as GPU components, evaluated in closed form on the CPU instead. Exported
 * so `dustLaneFeatures.ts` can read "how much column exists at this radius"
 * without re-deriving the profile — see its ledger comment.
 */
export function dustFaceOnColumn(
  radius: number,
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
): number {
  if (geometry.discFraction <= 0 || dust.tau <= 0) return 0;
  const shape = dustDiscShape(geometry, dust);
  let sigma = 0;
  for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
    const sigmaR = dustSigmaR(i, shape);
    sigma += DISC_SURFACE_WEIGHTS[i]! * Math.exp(-(radius * radius) / (2 * sigmaR * sigmaR));
  }
  // Debited by the cloud's own share so a reader of this column
  // (`dustLaneFeatures.ts`) never double-counts what the particles already
  // carry — see `clampedDustCloudShare`.
  return (dust.tau / shape.sumW) * sigma * (1 - clampedDustCloudShare(dust));
}

/** [] when there's no disc, or no dust — `tuning.dustEnabled` gates the shader loop, not this fn. */
export function buildGalaxyDustMixture(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
): readonly GalaxyFieldComponent[] {
  if (geometry.discFraction <= 0 || dust.tau <= 0) return [];

  const shape = dustDiscShape(geometry, dust);
  // Debited by the cloud's own share so the two tiers (smooth field /
  // particle cloud) never double-count the same measured central tau — see
  // `clampedDustCloudShare`. This function does NOT go through
  // `dustFaceOnColumn` (which already carries the same debit), so applying
  // it here is correct, not a duplicate.
  const scale = 1 - clampedDustCloudShare(dust);
  const extinctionRgb = dustExtinctionRgb(dust.rV);

  const out: GalaxyFieldComponent[] = [];
  for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
    const sigmaR = dustSigmaR(i, shape);
    // Component k's face-on (R=0) column is amplitude*sqrt(2*PI)*sigmaZ; this
    // amplitude makes that column tau*w_k/sumW*scale, so summing over k gives
    // tau*scale — tau with the cloud's share already removed.
    const amplitude =
      (dust.tau * DISC_SURFACE_WEIGHTS[i]! * scale) / (TAU_ROOT * shape.sigmaZ * shape.sumW);
    out.push({
      amplitude,
      invCovDiagonal: [
        1 / (sigmaR * sigmaR),
        1 / (shape.sigmaZ * shape.sigmaZ),
        1 / (sigmaR * sigmaR),
      ],
      invCovOffDiagonal: [0, 0, 0],
      // Extinction RATIOS, not an emission tint — splat.wesl reads this as
      // tauRGB's per-channel weight, never multiplied into a colour.
      color: extinctionRgb,
      center: ORIGIN,
      boundRadius: Math.max(sigmaR, shape.sigmaZ),
    });
  }
  return out;
}
