/**
 * buildGalaxyFieldMixture — the Gaussian mixture the analytic field pass
 * integrates in closed form, derived from the SAME geometry the sprite
 * generator ran with, so the two renderings of one galaxy agree by
 * construction and every preset gets its own field.
 *
 * Each sigma mirrors a `galaxyGen/generate.wesl` builder, cited on the line;
 * each amplitude is an emission share over the component's own Gaussian
 * volume, scaled to the sprite field's total flux (see `emissionScale`).
 * Colours stay eyeball values.
 */

import { discWarpShear } from '../../utils/galaxy/discWarpShear';
import { galaxyFieldInverseCovariance } from '../../utils/galaxy/galaxyFieldInverseCovariance';
import { spheroidEmissionSigma } from '../../utils/galaxy/spheroidEmissionSigma';
import type { GalaxyFieldComponent } from '../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';

/**
 * Uniform slots the shader reserves — `milkyWayField/io.wesl`'s
 * `comps: array<vec4<f32>, 36>` is 3 vec4 per component, so raising this
 * means widening that array too (the linker will not catch a mismatch).
 */
export const GALAXY_FIELD_MAX_COMPONENTS = 12;

/**
 * Mean cylindrical radius of a 2D Gaussian of unit sigma (Rayleigh), which is
 * the radius each component's warp is linearised at. The MASS-weighted mean,
 * not sigma itself: a component's stars sit at 1.25 sigma on average, and the
 * warp grows as rel^2, so linearising at sigma would under-bend every one.
 */
const MEAN_RADIUS_PER_SIGMA = Math.sqrt(Math.PI / 2);

/**
 * The warp is linearised ONCE per component, so a component spanning a wide
 * radial range smears it — the widest disc Gaussians most of all. If the bend
 * reads wrong at the disc edge, split the disc into more, narrower
 * components; that is the lever, not a richer per-component warp.
 */
function shapeOf(
  geometry: GalaxyFieldGeometry,
  sigmaAlong: number,
  sigmaPole: number,
  sigmaAcross: number,
  tiltRad: number,
): Pick<GalaxyFieldComponent, 'invCovDiagonal' | 'invCovOffDiagonal'> {
  const radius = MEAN_RADIUS_PER_SIGMA * Math.sqrt(sigmaAlong * sigmaAcross);
  const [shearX, shearZ] = discWarpShear(radius, geometry);
  return galaxyFieldInverseCovariance({
    sigmaAlong,
    sigmaPole,
    sigmaAcross,
    tiltRad,
    shearX,
    shearZ,
  });
}

/**
 * Sprite-flux parity, which `emissionScale` implements and analytic exposure
 * 1.0 therefore means. Integrated over the image both fields are a sum over
 * 1/distance^2, so the match is one equation —
 *   sum_k A_k (2*PI)^1.5 sigmaAlong sigmaAcross sigmaPole
 *     = GLOW_DISC_INTEGRAL * sum_i brightness_i * size_i^2
 * — whose right side is `milkyWayCloud/stars.wesl`: brightness x quad AREA x
 * the profile's integral, the px clamp cancelling its own area change. Over
 * populations that leaves `sum_pop share * multiplier` (what the amplitudes
 * below already are) times the three factors here, of which only
 * MEAN_FALLOFF_AND_JITTER lacks a closed form: mean falloff x size jitter
 * squared, 0.57 for the Milky Way and 0.55..0.78 across the gallery. The star
 * pass's `exposure` and `starSizeScale^2` ride the field exposure lane instead.
 */
const GLOW_DISC_INTEGRAL = 0.9294; // PI*(0.19865 + 0.17459 - 0.0774), over the unit disc
const MEAN_STAR_LUMINOSITY = 0.2392; // 0.12 + 0.4*E[u^3] + P(flare)*3.2*E[flare]
const MEAN_FALLOFF_AND_JITTER = 0.57;

function emissionScale(geometry: GalaxyFieldGeometry): number {
  return (
    geometry.modelledStars *
    geometry.starSize ** 2 *
    GLOW_DISC_INTEGRAL *
    MEAN_STAR_LUMINOSITY *
    MEAN_FALLOFF_AND_JITTER
  );
}

const TAU_ROOT = Math.sqrt(2 * Math.PI);
const TAU_ROOT3 = (2 * Math.PI) ** 1.5;

const DISC_COLOR = [0.86, 0.9, 1.0] as const;
const HALO_COLOR = [1.0, 0.92, 0.78] as const;
const BAR_COLOR = [1.0, 0.84, 0.62] as const;
const BULGE_COLOR = [1.0, 0.8, 0.55] as const;

// Population brightness multipliers, straight off each builder's
// `randomLuminosity(...) * K` line in generate.wesl.
const DISC_BRIGHTNESS = 1.35;
const BULGE_BRIGHTNESS = 0.85;
const BAR_BRIGHTNESS = 0.9;
const HALO_BRIGHTNESS = 0.5;

/**
 * A sum of Gaussians fitted (ridge-regularised NNLS) to exp(-R/h) over R in
 * [0, 7h]: sigmas in units of h, weights as central surface densities, both
 * dimensionless so the fit re-scales to any disc. Flux-weighted (by R, then
 * by the target itself so the R~1h peak doesn't swamp the faint R>5h tail)
 * and constrained to sum(weight_i * sigma_i^2) == 1, matching this mixture's
 * flux to the exponential's. Plain NNLS zeroes the outermost sigma outright —
 * near-collinear with its neighbour over a bounded domain — so a small ridge
 * splits weight across both instead, keeping the outer disc lit for `shapeOf`
 * to bend.
 */
const DISC_SIGMA_RATIOS = [0.35, 0.65, 1.15, 1.9, 3.4, 5.0] as const;
const DISC_SURFACE_WEIGHTS = [0.1667, 0.3065, 0.2131, 0.1365, 0.0049, 0.0007] as const;

/**
 * `buildDisk` samples exp(-R/diskScaleLen) but then multiplies brightness by
 * diskFalloff(radius, 1.7) = exp(-R / (1.7 * diskScaleLen)). Light is what an
 * additive field integrates, so the mixture's scale length is the product's,
 * a factor 1/(1 + 1/1.7) shorter than the one stars are drawn at.
 */
const DISK_BRIGHTNESS_TAPER = 1.7;

/** `buildDisk`'s vertical flare: diskHeight * (0.6 + bulgeRadius/(R + bulgeRadius)). */
const DISC_FLARE_FLOOR = 0.6;

// buildBar: alongBar = genNormal * 0.44, brightness *= exp(-alongBar^2 * 1.3).
// Two Gaussians in the same variable, so the emitted length is their product.
const BAR_ALONG_SPREAD = 0.44;
const BAR_END_FADE = 1.3;
const BAR_ALONG_RATIO = 1 / Math.sqrt(1 / BAR_ALONG_SPREAD ** 2 + 2 * BAR_END_FADE);

// buildBar: halfWidth = barLength * (0.14 + 0.09*rand) * (1 - 0.4*|alongBar|),
// averaged over the uniform draw and over |alongBar| (mean sqrt(2/PI) sigma).
const BAR_ACROSS_RATIO = (0.14 + 0.09 / 2) * (1 - 0.4 * Math.sqrt(2 / Math.PI) * BAR_ALONG_RATIO);

/** buildBar: y = genNormal * diskHeight * 1.4 — already a sigma, no conversion. */
const BAR_HEIGHT_FACTOR = 1.4;

/**
 * The spheroid draws are cuspier at the centre than any single Gaussian, so
 * the bulge is a bright core inside a broader body. The core's share and size
 * are eyeball; the body's size is then forced, because the pair's second
 * moment has to come back to the sampled one.
 */
const BULGE_CORE_WEIGHT = 0.3;
const BULGE_CORE_SIGMA_RATIO = 0.4;
const BULGE_BODY_SIGMA_RATIO = Math.sqrt(
  (1 - BULGE_CORE_WEIGHT * BULGE_CORE_SIGMA_RATIO ** 2) / (1 - BULGE_CORE_WEIGHT),
);

/**
 * The six-Gaussian disc, with a vertical flare that tracks radius.
 *
 * Freudenreich 1998 gives the real Milky Way a 2.605 kpc disc scale length
 * (1.563 generator units) where the MW preset samples 3.281. That gap is a
 * PRESET calibration question and a deliberate separate decision — this
 * mixture tracks whatever the generator was handed, so do not hardcode F98's
 * numbers back in here.
 */
function pushDisc(geometry: GalaxyFieldGeometry, out: GalaxyFieldComponent[]): void {
  if (geometry.discFraction <= 0) return;
  const scale = emissionScale(geometry);
  const scaleLen = geometry.diskScaleLen / (1 + 1 / DISK_BRIGHTNESS_TAPER);
  const central = (geometry.discFraction * DISC_BRIGHTNESS) / (2 * Math.PI * scaleLen * scaleLen);
  for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
    const sigmaR = DISC_SIGMA_RATIOS[i]! * scaleLen;
    const sigmaPole =
      geometry.diskHeight *
      (DISC_FLARE_FLOOR + geometry.bulgeRadius / (sigmaR + geometry.bulgeRadius));
    out.push({
      // Divided by sigmaPole alone: the fitted weights are SURFACE densities,
      // and it is the surface density the flare must leave untouched.
      amplitude: (scale * DISC_SURFACE_WEIGHTS[i]! * central) / (sigmaPole * TAU_ROOT),
      ...shapeOf(geometry, sigmaR, sigmaPole, sigmaR, 0),
      color: DISC_COLOR,
    });
  }
}

/** buildBulge's two radial branches, squashed by flattening / bulgeAxisZ and rotated. */
function pushBulge(geometry: GalaxyFieldGeometry, out: GalaxyFieldComponent[]): void {
  if (geometry.bulgeFraction <= 0) return;
  const { outerRadius, bulgeRadius, bulgeConcentration } = geometry;
  const sigma = spheroidEmissionSigma(
    geometry.category === 'elliptical'
      ? {
          scale: outerRadius * 0.16,
          exponent: 1.3,
          uClamp: 0.997,
          maxRadius: outerRadius * 1.6,
          falloffLength: outerRadius * (0.62 - 0.4 * bulgeConcentration),
        }
      : {
          scale: bulgeRadius * 0.55,
          exponent: 1.25,
          uClamp: 0.997,
          maxRadius: bulgeRadius * 2.8,
          falloffLength: bulgeRadius * (1.5 - bulgeConcentration),
        },
  );
  const emission = emissionScale(geometry) * geometry.bulgeFraction * BULGE_BRIGHTNESS;
  const shells = [
    [BULGE_CORE_WEIGHT, BULGE_CORE_SIGMA_RATIO],
    [1 - BULGE_CORE_WEIGHT, BULGE_BODY_SIGMA_RATIO],
  ] as const;
  for (const [weight, ratio] of shells) {
    const s = sigma * ratio;
    const volume = TAU_ROOT3 * s ** 3 * geometry.flattening * geometry.bulgeAxisZ;
    out.push({
      amplitude: (emission * weight) / volume,
      // sigmaAlong is s alone: bulgeAxisX is a fixed 1.0 in generate.wesl.
      ...shapeOf(
        geometry,
        s,
        s * geometry.flattening,
        s * geometry.bulgeAxisZ,
        geometry.bulgeTiltRad,
      ),
      color: BULGE_COLOR,
    });
  }
}

/** buildBar — absent for every category whose barLength is zero. */
function pushBar(geometry: GalaxyFieldGeometry, out: GalaxyFieldComponent[]): void {
  if (geometry.barFraction <= 0 || geometry.barLength <= 0) return;
  const sigmaAlong = BAR_ALONG_RATIO * geometry.barLength;
  const sigmaAcross = BAR_ACROSS_RATIO * geometry.barLength;
  const sigmaPole = BAR_HEIGHT_FACTOR * geometry.diskHeight;
  out.push({
    amplitude:
      (emissionScale(geometry) * geometry.barFraction * BAR_BRIGHTNESS) /
      (TAU_ROOT3 * sigmaAlong * sigmaAcross * sigmaPole),
    ...shapeOf(geometry, sigmaAlong, sigmaPole, sigmaAcross, geometry.barTiltRad),
    color: BAR_COLOR,
  });
}

/** buildHalo — the faint envelope, squashed along the pole by the same flattening. */
function pushHalo(geometry: GalaxyFieldGeometry, out: GalaxyFieldComponent[]): void {
  if (geometry.haloFraction <= 0) return;
  const { outerRadius } = geometry;
  const sigma = spheroidEmissionSigma({
    scale: outerRadius * 0.3,
    exponent: 1.35,
    uClamp: 0.998,
    maxRadius: outerRadius * 2.4,
    falloffLength: outerRadius * (0.85 - 0.45 * geometry.bulgeConcentration),
  });
  const sigmaPole = sigma * geometry.flattening;
  out.push({
    amplitude:
      (emissionScale(geometry) * geometry.haloFraction * HALO_BRIGHTNESS) /
      (TAU_ROOT3 * sigma * sigma * sigmaPole),
    ...shapeOf(geometry, sigma, sigmaPole, sigma, 0),
    color: HALO_COLOR,
  });
}

/**
 * At most 10 components — comfortably inside the shader's 12. Structure the
 * closed form cannot carry (spiral arms, the lopsided modulation, the
 * irregular bar offset) is folded into the axisymmetric disc or dropped; the
 * warp survives as a per-component shear, see `shapeOf`.
 */
export function buildGalaxyFieldMixture(
  geometry: GalaxyFieldGeometry,
): readonly GalaxyFieldComponent[] {
  const out: GalaxyFieldComponent[] = [];
  pushDisc(geometry, out);
  pushBulge(geometry, out);
  pushBar(geometry, out);
  pushHalo(geometry, out);
  return out;
}
