/**
 * buildGalaxyDustMixture — dust as an ABSORPTION mixture: pushDisc's own
 * four-Gaussian disc fit, evaluated at the dust disc's own scale length,
 * amplitude the central V-band extinction density (not an emissivity).
 * Measured anchors, cited in full on `GalaxyDustParams`: scale-length ratio
 * 1.4-1.75, height ratio 0.25-0.75, central face-on tau_V 0.5-1.
 */
import { discLightScaleLength } from '../../utils/galaxy/discLightScaleLength';
import { DISC_SIGMA_RATIOS, DISC_SURFACE_WEIGHTS } from './galaxyFieldMixture';
import type { GalaxyDustParams } from '../../@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldComponent } from '../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';

// CCM89 Table 3 A_lambda/A_V, interpolated in 1/lambda to the sRGB primaries
// (~612/549/465 nm). Rides the colour lane so a future preset can carry a
// different (e.g. greyer starburst) law with no shader change.
export const DUST_EXTINCTION_RGB: readonly [number, number, number] = [0.88, 1.0, 1.25];

const TAU_ROOT = Math.sqrt(2 * Math.PI);
const ORIGIN: readonly [number, number, number] = [0, 0, 0];

/** [] when there's no disc, or no dust — `tuning.dustEnabled` gates the shader loop, not this fn. */
export function buildGalaxyDustMixture(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
): readonly GalaxyFieldComponent[] {
  if (geometry.discFraction <= 0 || dust.tau <= 0) return [];

  const hDust = dust.scaleLenRatio * discLightScaleLength(geometry);
  // No vertical flare (unlike the stellar disc): thin, measured-flat layer.
  const sigmaZ = dust.heightRatio * geometry.diskHeight;
  // This mixture is flat (grill Q5); the disc itself isn't past warpStartRadius.
  // Capping sigmaR there is a flat-model VALIDITY boundary, not a physical dust
  // truncation — it stops the widest component's 2-sigma tail from reaching into
  // the warped ring band and visibly disagreeing with it. Warped outer dust is
  // deferred to the dust-map detail tier, where ring-placed blobs are affordable.
  // sigmaZ (and so the face-on central tau, which depends only on sigmaZ) is untouched.
  const sigmaRCap = geometry.warpStrength > 0 ? geometry.warpStartRadius * 0.5 : Infinity;

  const sumW = DISC_SURFACE_WEIGHTS.reduce((sum, w) => sum + w, 0);
  const out: GalaxyFieldComponent[] = [];
  for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
    const sigmaR = Math.min(DISC_SIGMA_RATIOS[i]! * hDust, sigmaRCap);
    // Component k's face-on (R=0) column is amplitude*sqrt(2*PI)*sigmaZ; this
    // amplitude makes that column tau*w_k/sumW, so summing over k gives tau.
    const amplitude = (dust.tau * DISC_SURFACE_WEIGHTS[i]!) / (TAU_ROOT * sigmaZ * sumW);
    out.push({
      amplitude,
      invCovDiagonal: [1 / (sigmaR * sigmaR), 1 / (sigmaZ * sigmaZ), 1 / (sigmaR * sigmaR)],
      invCovOffDiagonal: [0, 0, 0],
      // Extinction RATIOS, not an emission tint — splat.wesl reads this as
      // tauRGB's per-channel weight, never multiplied into a colour.
      color: DUST_EXTINCTION_RGB,
      center: ORIGIN,
      boundRadius: Math.max(sigmaR, sigmaZ),
    });
  }
  return out;
}
