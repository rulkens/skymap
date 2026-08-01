/**
 * buildGalaxyDustMixture — dust as an ABSORPTION mixture: pushDisc's own
 * four-Gaussian disc fit, evaluated at the dust disc's own scale length,
 * amplitude the central V-band extinction density (not an emissivity).
 * Measured anchors, cited in full on `GalaxyDustParams`: scale-length ratio
 * 1.4-1.75, height ratio 0.25-0.75, central face-on tau_V 0.5-1.
 */
import { armCrossSigma } from './armRidgeGeometry';
import { DISC_SIGMA_RATIOS, DISC_SURFACE_WEIGHTS } from './discSurfaceFit';
import { armCarriedFraction } from '../../utils/galaxy/armCarriedFraction';
import { discLightScaleLength } from '../../utils/galaxy/discLightScaleLength';
import { dustExtinctionRgb } from '../../utils/galaxy/dustExtinctionRgb';
import type { GalaxyDustNetworkParams } from '../../@types/galaxy/GalaxyDustNetworkParams';
import type { GalaxyDustParams } from '../../@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldComponent } from '../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';
import type { GalaxyFieldTuning } from '../../@types/galaxy/GalaxyFieldTuning';

const TAU_ROOT = Math.sqrt(2 * Math.PI);
const ORIGIN: readonly [number, number, number] = [0, 0, 0];

/** `armCrossSigma` only reads `.armWidthScale`; the dust ledger has no field tuning of its own to hand it. */
const ARM_WIDTH_TUNING = { armWidthScale: 1 } as GalaxyFieldTuning;

/** Exported so `dustParticleCloud.ts` sizes its mass budget off the SAME disc profile rather than re-deriving it. */
export type DustDiscShape = {
  readonly hDust: number;
  readonly sigmaZ: number;
  readonly sigmaRCap: number;
  readonly sumW: number;
};

/**
 * `dust.cloud.share`, clamped to a valid probability: the ledger below splits
 * one tau budget three ways (particles / flat features / smooth field) and
 * the three must never sum past the measured total.
 */
export function clampedDustCloudShare(dust: GalaxyDustParams): number {
  return Math.min(1, Math.max(0, dust.cloud.share));
}

/**
 * This mixture is flat (grill Q5); the disc itself isn't past warpStartRadius.
 * Capping sigmaR there is a flat-model VALIDITY boundary, not a physical dust
 * truncation — it stops the widest component's 2-sigma tail from reaching into
 * the warped ring band and visibly disagreeing with it. Warped outer dust is
 * deferred to the dust-map detail tier, where ring-placed blobs are affordable.
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
 * so `dustLaneFeatures.ts` can read "how much column exists at this radius
 * to redistribute into a lane" without re-deriving the profile — see its
 * ledger comment.
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
  // Debited by the cloud's own share so the flat feature tier reading this
  // column (`dustLaneFeatures.ts`) never double-counts what the particles
  // already carry — see `clampedDustCloudShare`.
  return (dust.tau / shape.sumW) * sigma * (1 - clampedDustCloudShare(dust));
}

/**
 * armCarriedDustFraction — the ledger debit `buildGalaxyDustMixture` applies
 * to the smooth global lane once the filament network concentrates part of
 * it into arm-hugging lanes (design doc N1b's zero-mean discipline): without
 * it the two layers double-count the same dust. `armContrast` is a measured
 * arm/interarm ratio over the ARM's own physical footprint (`armCrossSigma`,
 * unscaled), not the narrower absorption lane `dustLaneFeatures.ts` actually
 * draws inside that footprint — the same "lanes are a fraction of the arm
 * width" distinction that function's own width comment makes.
 *
 * v1 uses ONE radius-averaged fraction — evaluated at the disc's own
 * light-weighted scale length, a single representative "mean lane geometry"
 * — rather than `dustLaneFeatures.ts`'s own per-segment f_arm(R):
 * conservative (one global scale factor can't distort a particular radius
 * the way a wrong per-annulus curve could) and simple. A per-annulus debit
 * is future work if the flat disc's radial profile ever visibly fights the
 * lanes it's supposed to feed.
 */
export function armCarriedDustFraction(
  geometry: GalaxyFieldGeometry,
  network: GalaxyDustNetworkParams,
): number {
  if (geometry.numArms <= 0) return 0;
  const hLight = discLightScaleLength(geometry);
  const armWidth = armCrossSigma(hLight, geometry, ARM_WIDTH_TUNING);
  return armCarriedFraction(
    network.armContrast,
    geometry.numArms * 2 * armWidth,
    2 * Math.PI * hLight,
  );
}

/** [] when there's no disc, or no dust — `tuning.dustEnabled` gates the shader loop, not this fn. */
export function buildGalaxyDustMixture(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
): readonly GalaxyFieldComponent[] {
  if (geometry.discFraction <= 0 || dust.tau <= 0) return [];

  const shape = dustDiscShape(geometry, dust);
  // Debited by the arm-carried share AND the cloud's own share so the three
  // tiers (smooth field / flat network lanes / particle cloud) never
  // double-count the same measured central tau — see `armCarriedDustFraction`'s
  // header and `clampedDustCloudShare`. This function does NOT go through
  // `dustFaceOnColumn` (which already carries the cloud debit), so applying
  // it again here is correct, not a duplicate.
  const scale =
    (1 - armCarriedDustFraction(geometry, dust.network)) * (1 - clampedDustCloudShare(dust));
  const extinctionRgb = dustExtinctionRgb(dust.rV);

  const out: GalaxyFieldComponent[] = [];
  for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
    const sigmaR = dustSigmaR(i, shape);
    // Component k's face-on (R=0) column is amplitude*sqrt(2*PI)*sigmaZ; this
    // amplitude makes that column tau*w_k/sumW*scale, so summing over k gives
    // tau*scale — tau with the arm-carried share already removed.
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
