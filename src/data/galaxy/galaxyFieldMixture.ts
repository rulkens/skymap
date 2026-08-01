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
import { inverseCovarianceFromFrame } from '../../utils/galaxy/inverseCovarianceFromFrame';
import { spheroidEmissionSigma } from '../../utils/galaxy/spheroidEmissionSigma';
import { warpHeight } from '../../utils/galaxy/warpHeight';
import { warpSurfaceFrame } from '../../utils/galaxy/warpSurfaceFrame';
import type { GalaxyFieldComponent } from '../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';
import type { GalaxyFieldTuning } from '../../@types/galaxy/GalaxyFieldTuning';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Uniform slots the shader reserves — `milkyWayField/io.wesl`'s
 * `comps: array<vec4<f32>, 2400>` is 4 vec4 per component, so raising this
 * means widening that array too (the linker will not catch a mismatch). Set
 * to cover the ring sliders' worst case (12 rings x 48 blobs = 576) plus the
 * other populations (8), with headroom. `packFieldUniforms` CLAMPS to this
 * silently, so a slider ceiling above it drops components with no warning —
 * raise the two together or not at all.
 *
 * The bound that actually bites is not this one: at 600 components the
 * uniform is 38 KB, comfortably inside WebGPU's guaranteed 64 KB binding,
 * while the fullscreen pass evaluates EVERY component in EVERY fragment (see
 * `buildGalaxyFieldMixture`).
 */
export const GALAXY_FIELD_MAX_COMPONENTS = 600;

/** Every population but the outer-disc rings sits at the origin. */
const ORIGIN: Vec3 = [0, 0, 0];

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
): Pick<GalaxyFieldComponent, 'invCovDiagonal' | 'invCovOffDiagonal' | 'boundRadius'> {
  const radius = MEAN_RADIUS_PER_SIGMA * Math.sqrt(sigmaAlong * sigmaAcross);
  const [shearX, shearZ] = discWarpShear(radius, geometry);
  // The shear S^-1 stretches the unsheared ellipsoid by at most this factor
  // (S = I + e_y*(shearX, shearZ), operator norm bounded by 1 + |shear|), so
  // the splat path's billboard has to grow by it too or it clips the blob.
  const boundRadius =
    Math.max(sigmaAlong, sigmaPole, sigmaAcross) * (1 + Math.hypot(shearX, shearZ));
  return {
    ...galaxyFieldInverseCovariance({
      sigmaAlong,
      sigmaPole,
      sigmaAcross,
      tiltRad,
      shearX,
      shearZ,
    }),
    boundRadius,
  };
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
 * flux to the exponential's, over the FULL six-term fit — sigma ratios 3.4
 * and 5.0 are no longer rendered as origin-centred blobs here (see
 * `pushDiscRings`), but their weight share still anchors the ring flux
 * budget below, so only the surviving four are listed.
 */
const DISC_SIGMA_RATIOS = [0.35, 0.65, 1.15, 1.9] as const;
const DISC_SURFACE_WEIGHTS = [0.1667, 0.3065, 0.2131, 0.1365] as const;

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
 * The four-Gaussian INNER disc, with a vertical flare that tracks radius.
 * All four radii sit inside `warpStartRadius` for every shipped preset
 * (`MEAN_RADIUS_PER_SIGMA * 1.9 * scaleLen` is still well short of a typical
 * warp onset), so `shapeOf`'s shear is zero for them and the plain unsheared
 * Gaussian is exact — the warp lives entirely in `pushDiscRings`.
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
      center: ORIGIN,
    });
  }
}

/**
 * Ring geometry the two removed disc Gaussians (sigma ratios 3.4h, 5.0h) are
 * replaced by — a starting point for tuning, not derived: two rings bracket
 * the warp onset, the overlap factor lets neighbouring blobs' azimuthal
 * Gaussians merge into a ring instead of beading, and the 70/30 flux split
 * (a geometric ratio of 3/7 ring-to-ring) favours the inner, brighter, less
 * warped ring. `pushDiscRings` generalises to any ring COUNT — see
 * `GalaxyFieldTuning.ringCount` — with these as the two-ring default.
 *
 * RADIAL sigma was retuned down from an initial 0.28*outerRadius: at that
 * width a ring's blobs stayed dense a full ring-spacing away, so the query
 * point at R=1.0*outerRadius sampled MOSTLY the inner ring's weaker,
 * near-onset warp instead of the outer ring's — each blob's shear is only a
 * valid linearisation near its OWN centre, and a too-wide blob gets sampled
 * well outside that. 0.1 keeps each ring's height signal local to itself
 * without reintroducing visible beading (azimuthal overlap is the knob for that).
 */
const RING_RADII_FRAC = [0.75, 0.98] as const;
const RING_FLUX_SPLIT = [0.7, 0.3] as const;
/**
 * Each blob is a STRAIGHT ellipsoid standing in for an ARC, so its ends fall
 * inside the ring by 1 - cos(2 sigma / R). Ten blobs put 2 sigma at 40 degrees
 * of arc — ends 23% of R inside the ring, which reads face-on as a ten-pointed
 * star. Twenty-four holds that under 5%. Blob COUNT, not azimuthal overlap, is
 * the knob for spikes: overlap already suppresses beading to well under 1%.
 */
const RING_BLOBS_PER_RING = 24;
/** Rings 0.23 apart, so this is ~1.8 sigma of separation — closer reads as one disc, not two. */
const RING_RADIAL_SIGMA_FRAC = 0.13;
const RING_AZIMUTHAL_OVERLAP = 0.55;

/**
 * `buildGalaxyFieldMixture`'s default when no tuning is supplied — restates
 * the constants just above, so an absent `tuning` argument reproduces today's
 * two-ring field exactly (`ringFluxFalloff` is the 0.7/0.3 split's own ratio,
 * 3/7). `galaxy-renderer`'s FieldSection is the only other producer of a
 * `GalaxyFieldTuning`, built by patching this object.
 */
export const DEFAULT_GALAXY_FIELD_TUNING: GalaxyFieldTuning = {
  ringCount: RING_RADII_FRAC.length,
  ringInnerRadiusFrac: RING_RADII_FRAC[0],
  ringOuterRadiusFrac: RING_RADII_FRAC[1],
  ringBlobsPerRing: RING_BLOBS_PER_RING,
  ringRadialSigmaFrac: RING_RADIAL_SIGMA_FRAC,
  ringAzimuthalOverlap: RING_AZIMUTHAL_OVERLAP,
  ringFluxFalloff: RING_FLUX_SPLIT[1] / RING_FLUX_SPLIT[0],
  ringBlobSharpness: 1,
};

/** The removed pair's share of the disc's flux budget — see DISC_SIGMA_RATIOS' fit note. */
const REMOVED_OUTER_DISC_WEIGHT = 0.0049 * 3.4 ** 2 + 0.0007 * 5.0 ** 2;

/**
 * The warped outer disc, built from blobs placed at their OWN true warped
 * height (`warpHeight`) rather than from shearing an origin-centred
 * Gaussian: a shear traces a straight line through the origin, but the real
 * warp is flat inside `warpStartRadius` and only then bends as rel^2 — no
 * shear of an origin-centred blob can reproduce that shape. Once a blob has
 * its own centre, `discWarpShear` (evaluated at the blob's ring radius) is a
 * legitimate linearisation of the warp about that centre, not a stand-in for
 * displacement, so it still shapes each blob's tilt.
 *
 * Ring COUNT is a tunable, not a fixed pair: two rings can only bracket the
 * warp with two straight-line segments, and a real warp bends continuously,
 * so more rings (each still a valid linearisation about its OWN centre) is
 * the fix, not a richer per-ring shape. Radii are evenly spaced between the
 * inner and outer fractions; flux follows a GEOMETRIC falloff ring-to-ring
 * (inner brightest) rather than a fixed split, so it generalises past two
 * rings — `ringFluxFalloff` of 3/7 reproduces the original 70/30 split
 * exactly at `ringCount` 2.
 *
 * Orientation comes from `warpSurfaceFrame` — the real tangent plane at each
 * blob's own (radius, azimuth) — NOT from `discWarpShear`. That shear is the
 * slope of a plane through the ORIGIN, which is the chord to the warped ring
 * rather than the tangent at it: with the warp growing as rel^2 the tangent
 * is `2/(R - warpStartRadius)` against the chord's `1/R`, several times
 * steeper at a typical ring radius. Blobs tilted by the chord read as flat
 * pancakes fanning out of the disc instead of a continuous bending sheet.
 */
function pushDiscRings(
  geometry: GalaxyFieldGeometry,
  out: GalaxyFieldComponent[],
  tuning: GalaxyFieldTuning,
): void {
  if (geometry.discFraction <= 0) return;
  const { outerRadius, bulgeRadius, diskHeight } = geometry;
  const ringCount = Math.max(1, Math.round(tuning.ringCount));
  const blobsPerRing = tuning.ringBlobsPerRing;
  const totalFlux =
    emissionScale(geometry) * geometry.discFraction * DISC_BRIGHTNESS * REMOVED_OUTER_DISC_WEIGHT;
  const radialSigma = tuning.ringRadialSigmaFrac * outerRadius;

  // Un-normalised geometric weights, inner (r=0) to outer, then divided by
  // their sum below — the shape a fixed per-ring split can't express once
  // ringCount is a slider.
  let weightSum = 0;
  const weights: number[] = [];
  for (let r = 0; r < ringCount; r++) {
    const w = tuning.ringFluxFalloff ** r;
    weights.push(w);
    weightSum += w;
  }

  for (let r = 0; r < ringCount; r++) {
    const frac =
      ringCount === 1
        ? (tuning.ringInnerRadiusFrac + tuning.ringOuterRadiusFrac) / 2
        : tuning.ringInnerRadiusFrac +
          ((tuning.ringOuterRadiusFrac - tuning.ringInnerRadiusFrac) * r) / (ringCount - 1);
    const radius = frac * outerRadius;
    const blobFlux = (totalFlux * (weights[r]! / weightSum)) / blobsPerRing;
    // Sharpness shrinks all three axes together, so a blob keeps its aspect
    // ratio (and therefore reads as an ORIENTED cigar, not a dot) while the
    // ring separates into countable blobs. Flux per blob is held fixed, which
    // is why amplitude is recomputed from the shrunken sigmas.
    const sharpness = Math.max(1, tuning.ringBlobSharpness);
    const sigmas = {
      along: (((2 * Math.PI * radius) / blobsPerRing) * tuning.ringAzimuthalOverlap) / sharpness,
      across: radialSigma / sharpness,
      pole: (diskHeight * (DISC_FLARE_FLOOR + bulgeRadius / (radius + bulgeRadius))) / sharpness,
    };
    const amplitude = blobFlux / (TAU_ROOT3 * sigmas.along * sigmas.across * sigmas.pole);
    // No extra warp-shear inflation here (unlike `shapeOf`): each blob already
    // sits at its own true warped centre and orientation, so its sigmas alone
    // bound it.
    const boundRadius = Math.max(sigmas.along, sigmas.across, sigmas.pole);
    for (let k = 0; k < blobsPerRing; k++) {
      const phi = (k / blobsPerRing) * Math.PI * 2;
      out.push({
        amplitude,
        ...inverseCovarianceFromFrame(warpSurfaceFrame(radius, phi, geometry), sigmas),
        color: DISC_COLOR,
        center: [radius * Math.cos(phi), warpHeight(radius, phi, geometry), radius * Math.sin(phi)],
        boundRadius,
      });
    }
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
      center: ORIGIN,
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
    center: ORIGIN,
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
    center: ORIGIN,
  });
}

/**
 * Component count now rides `tuning.ringCount * tuning.ringBlobsPerRing`: at
 * both sliders' ceiling that is 4 inner disc + 12*48 ring + 2 bulge + 1 bar +
 * 1 halo = 584, inside the shader's 600 (`GALAXY_FIELD_MAX_COMPONENTS`);
 * `packFieldUniforms` clamps if that ever changes. That ceiling is a TUNING
 * range, not a target — `milkyWayField/field.wesl` is one fullscreen pass
 * evaluating every component in every fragment, so cost is linear in this
 * number. Structure the closed form cannot carry (spiral arms, the lopsided
 * modulation, the irregular bar offset) is folded into the axisymmetric disc
 * or dropped; the warp survives as blob placement (`pushDiscRings`) plus each
 * component's own linearised shear (`shapeOf`).
 */
export function buildGalaxyFieldMixture(
  geometry: GalaxyFieldGeometry,
  tuning: GalaxyFieldTuning = DEFAULT_GALAXY_FIELD_TUNING,
): readonly GalaxyFieldComponent[] {
  const out: GalaxyFieldComponent[] = [];
  pushDisc(geometry, out);
  pushDiscRings(geometry, out, tuning);
  pushBulge(geometry, out);
  pushBar(geometry, out);
  pushHalo(geometry, out);
  return out;
}
