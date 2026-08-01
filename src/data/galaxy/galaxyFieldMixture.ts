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
import type { GalaxyFieldArmRecord } from '../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldComponent } from '../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';
import type { GalaxyFieldTuning } from '../../@types/galaxy/GalaxyFieldTuning';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Uniform slots the shader reserves — `milkyWayField/io.wesl`'s
 * `comps: array<vec4<f32>, 4000>` is 4 vec4 per component, so raising this
 * means widening that array too (the linker will not catch a mismatch).
 * Sliders' worst case is now 12 rings x 24 fixed blobs + 8 arms x 64 blobs +
 * 8 other populations = 808, under this cap today, but `packFieldUniforms`
 * CLAMPS silently past whatever the cap is, so a slider range raised past it
 * drops components with no warning; `FieldSection`'s readout surfaces that
 * instead of leaving it silent. Raise the cap and `io.wesl`'s array together
 * or not at all.
 *
 * The bound that actually bites is WebGPU's guaranteed 64 KiB uniform
 * binding: header (96 B) + N x 64 B <= 65536 B caps N at 1022, and the
 * fullscreen pass evaluates EVERY component in EVERY fragment (see
 * `buildGalaxyFieldMixture`), so 1000 is a cost ceiling as much as a byte one.
 */
export const GALAXY_FIELD_MAX_COMPONENTS = 1000;

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
function pushDisc(
  geometry: GalaxyFieldGeometry,
  out: GalaxyFieldComponent[],
  tuning: GalaxyFieldTuning,
): void {
  if (!tuning.discEnabled || geometry.discFraction <= 0) return;
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
 * replaced by. Two rings bracket the warp onset; `pushDiscRings` generalises
 * to any ring COUNT — see `GalaxyFieldTuning.ringCount` — with these four
 * constants as the fixed band/overlap the count slider plays inside of.
 */
/**
 * Inner/outer band the rings span, a fraction of the disc's `outerRadius`.
 * Calibrated by eye against the sprite field, not derived — a property of
 * the model (every preset's warp bracket), not a per-galaxy knob.
 */
const RING_INNER_RADIUS_FRAC = 0.75;
const RING_OUTER_RADIUS_FRAC = 0.98;
/**
 * Each blob is a STRAIGHT ellipsoid standing in for an ARC, so its ends fall
 * inside the ring by 1 - cos(2 sigma / R). Ten blobs put 2 sigma at 40 degrees
 * of arc — ends 23% of R inside the ring, which reads face-on as a ten-pointed
 * star. Twenty-four holds that under 5%. Blob COUNT, not azimuthal overlap, is
 * the knob for spikes: overlap already suppresses beading to well under 1%.
 * Calibrated by eye; a property of the model, not per-galaxy.
 */
export const RING_BLOBS_PER_RING = 24;
/**
 * Azimuthal blob-to-blob overlap: 1.0 sets a blob's along-ring sigma to its
 * own ring spacing. Calibrated by eye (beading below ~1% at this value); a
 * property of the model, not per-galaxy. Also feeds `pushArmRidges`' along
 * sigma — that reuse is deliberate, not copy-paste (both are arc-length blobs
 * on a curve, same suppression trade-off).
 */
const RING_AZIMUTHAL_OVERLAP = 0.55;
/**
 * Each ring's radial sigma is derived, not tuned: `ringSpacing * this`, where
 * ringSpacing is the band divided across the live ring count (see
 * `pushDiscRings`). Chosen so the two-ring DEFAULT (spacing 0.23) reproduces
 * the old calibrated sigma of 0.13*outerRadius: 0.13 / 0.23 = 13/23.
 */
const RING_RADIAL_OVERLAP = 13 / 23;

/**
 * `buildGalaxyFieldMixture`'s default when no tuning is supplied — the
 * two-ring field the constants above already describe. `galaxy-renderer`'s
 * FieldSection is the only other producer of a `GalaxyFieldTuning`, built by
 * patching this object.
 */
export const DEFAULT_GALAXY_FIELD_TUNING: GalaxyFieldTuning = {
  discEnabled: true,
  ringCount: 2,
  ringBlobSharpness: 1,
  ringsEnabled: true,
  armsEnabled: true,
  armBlobsPerArm: 28,
  armWidthScale: 1,
  armFluxBoost: 1,
  armBlobSharpness: 1,
};

/** The removed pair's share of the disc's flux budget — see DISC_SIGMA_RATIOS' fit note. */
const REMOVED_OUTER_DISC_WEIGHT = 0.0049 * 3.4 ** 2 + 0.0007 * 5.0 ** 2;

/** Closed form of ∫ exp(-R/h) R dR — h the disc's surface-density scale length. */
function discSurfaceIntegral(radius: number, h: number): number {
  return -h * Math.exp(-radius / h) * (radius + h);
}

/**
 * Each ring's share of `Σ(R) = exp(-R/h)` integrated over its own annulus —
 * boundaries at the midpoints between neighbouring ring radii, the band ends
 * extended by half a spacing — normalised to sum to 1. A single ring's
 * annulus is whatever `spacing` makes it, but with nothing to divide by it
 * always ends up weight 1.
 */
function ringAnnulusWeights(radii: readonly number[], spacing: number, h: number): number[] {
  const bounds = [radii[0]! - spacing / 2];
  for (let r = 0; r < radii.length - 1; r++) bounds.push((radii[r]! + radii[r + 1]!) / 2);
  bounds.push(radii[radii.length - 1]! + spacing / 2);

  const raw = radii.map(
    (_, r) => discSurfaceIntegral(bounds[r + 1]!, h) - discSurfaceIntegral(Math.max(0, bounds[r]!), h),
  );
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

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
 * inner and outer fractions; each ring's flux is that ring's own share of
 * `Σ(R) = exp(-R/diskScaleLen)` integrated over its annulus (see
 * `ringAnnulusWeights` above), so the split follows the disc's real profile
 * at any ring count instead of a hand-picked ratio.
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
  if (!tuning.ringsEnabled || geometry.discFraction <= 0) return;
  const { outerRadius, bulgeRadius, diskHeight, diskScaleLen } = geometry;
  const ringCount = Math.max(1, Math.round(tuning.ringCount));
  const blobsPerRing = RING_BLOBS_PER_RING;
  const totalFlux =
    emissionScale(geometry) * geometry.discFraction * DISC_BRIGHTNESS * REMOVED_OUTER_DISC_WEIGHT;

  // One spacing drives both the radial sigma and the annulus weights below —
  // the band split N-1 ways, or (one ring) the band's own half-width.
  const spacingFrac =
    ringCount === 1
      ? (RING_OUTER_RADIUS_FRAC - RING_INNER_RADIUS_FRAC) / 2
      : (RING_OUTER_RADIUS_FRAC - RING_INNER_RADIUS_FRAC) / (ringCount - 1);
  const radialSigma = spacingFrac * outerRadius * RING_RADIAL_OVERLAP;

  const radii: number[] = [];
  for (let r = 0; r < ringCount; r++) {
    const frac =
      ringCount === 1
        ? (RING_INNER_RADIUS_FRAC + RING_OUTER_RADIUS_FRAC) / 2
        : RING_INNER_RADIUS_FRAC + spacingFrac * r;
    radii.push(frac * outerRadius);
  }
  const weights = ringAnnulusWeights(radii, spacingFrac * outerRadius, diskScaleLen);

  for (let r = 0; r < ringCount; r++) {
    const radius = radii[r]!;
    const blobFlux = (totalFlux * weights[r]!) / blobsPerRing;
    // Sharpness shrinks all three axes together, so a blob keeps its aspect
    // ratio (and therefore reads as an ORIENTED cigar, not a dot) while the
    // ring separates into countable blobs. Flux per blob is held fixed, which
    // is why amplitude is recomputed from the shrunken sigmas.
    const sharpness = Math.max(1, tuning.ringBlobSharpness);
    const sigmas = {
      along: (((2 * Math.PI * radius) / blobsPerRing) * RING_AZIMUTHAL_OVERLAP) / sharpness,
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

// buildArmSlot: randomLuminosity * 1.9 * armFade * clumpMod — the ridge's own
// brightness multiplier, off spiralArms' regular (non-HII) arm star line.
const ARM_BRIGHTNESS = 1.9;

/** Hot blue-white, nudged bluer with youngFraction — eyeball, echoing tempColorRamp(0.6 + 0.36*youngFraction)'s direction without matching its curve. */
const ARM_COLOR_OLD: Readonly<Vec3> = [0.8, 0.86, 1.0];
const ARM_COLOR_YOUNG: Readonly<Vec3> = [0.65, 0.78, 1.0];

function armColor(youngFraction: number): Vec3 {
  const t = Math.min(1, Math.max(0, youngFraction));
  return [
    ARM_COLOR_OLD[0] + (ARM_COLOR_YOUNG[0] - ARM_COLOR_OLD[0]) * t,
    ARM_COLOR_OLD[1] + (ARM_COLOR_YOUNG[1] - ARM_COLOR_OLD[1]) * t,
    ARM_COLOR_OLD[2] + (ARM_COLOR_YOUNG[2] - ARM_COLOR_OLD[2]) * t,
  ];
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function smoothstep01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** armStarSample's ridge angle: log-spiral phase + meander + (gated) high-frequency wave. */
function armRidgeAngle(logR: number, geometry: GalaxyFieldGeometry, arm: GalaxyFieldArmRecord): number {
  const angle =
    arm.phase + arm.pitch * logR + arm.meanderAmp * Math.sin(arm.meanderFreq * logR * 2 + arm.meanderPhase);
  // waveAmount is 0 for most presets, in which case this term is 0 too — no
  // separate gate needed, unlike the WGSL source's `if` (a branch that only
  // exists there to skip four sin() calls per star).
  return (
    angle +
    geometry.waveAmount *
      (Math.sin(arm.waveF1 * logR + arm.waveP1) * 0.16 + Math.sin(arm.waveF2 * logR + arm.waveP2) * 0.09)
  );
}

/** The arm's true warped centre at (radius, its own ridge angle) — armStarSample's `x`/`y`/`z` before scatter. */
function armCurvePos(radius: number, geometry: GalaxyFieldGeometry, arm: GalaxyFieldArmRecord): Vec3 {
  const angle = armRidgeAngle(Math.log(radius / geometry.armStartRadius), geometry, arm);
  return [radius * Math.cos(angle), warpHeight(radius, angle, geometry), radius * Math.sin(angle)];
}

/** armStarSample's inner/outer smoothstep brightness envelope, this arm's own fadeRadius (rec0.w). */
function armFadeEnvelope(radius: number, geometry: GalaxyFieldGeometry, arm: GalaxyFieldArmRecord): number {
  const innerT = (radius - geometry.armStartRadius) / geometry.armInnerRampW;
  const outerT = (radius - geometry.armFullRadius) / Math.max(0.001, arm.fadeRadius - geometry.armFullRadius);
  return smoothstep01(innerT) * (1 - smoothstep01(outerT));
}

/** armStarSample's along-arm low-frequency modulation; 1 (no modulation) when clumpAmount is 0. */
function armClumpMod(logR: number, geometry: GalaxyFieldGeometry, arm: GalaxyFieldArmRecord): number {
  if (geometry.clumpAmount <= 0) return 1;
  const noise =
    Math.sin(logR * arm.clumpF1 + arm.clumpP1) * 0.6 + Math.sin(logR * arm.clumpF2 + arm.clumpP2) * 0.4;
  return 1 - geometry.clumpAmount * (0.5 - 0.5 * noise);
}

/** armStarSample's gap-survival fraction for non-HII stars — the smooth stand-in for the WGSL gate's coin flip. */
function armSurvival(clumpMod: number, geometry: GalaxyFieldGeometry): number {
  return geometry.clumpAmount > 0 ? Math.min(1, 0.4 + 0.6 * clumpMod) : 1;
}

/**
 * Spiral-arm RIDGE blobs, placed along the exact log-spiral curve
 * `armStarSample` draws stars around (`generate.wesl` lines ~652-771, cited
 * per-function above) so the analytic arms land ON the sprite arms rather
 * than approximating their pitch from the outside.
 *
 * Deliberately SKIPPED this pass, each because it complicates the ridge
 * curve rather than the cross-section: `applyLopsided` (post-ridge radius
 * modulation), the `isSubArm` spur branch, and HII knots/newborns (those
 * stay sprites by design — research doc s11.4/s12). Also left out of the
 * cross-section: the angle-feather scatter
 * (`genNormal*armWidthFactor*(1+armStartRadius/radius)`), which is mostly
 * ALONG the arm rather than across it — fold it into `across`'s sigma in a
 * later pass, not this one.
 *
 * Flux bookkeeping: `readGalaxyFieldGeometry` un-folds spiralArms iterations
 * out of `discFraction` into `armFraction`, so this function spends the
 * arms' OWN share — adding it on top of an unchanged disc would double the
 * arms' light (see that file's comment on the trap).
 */
function pushArmRidges(
  geometry: GalaxyFieldGeometry,
  out: GalaxyFieldComponent[],
  tuning: GalaxyFieldTuning,
): void {
  if (!tuning.armsEnabled || geometry.armFraction <= 0 || geometry.numArms <= 0) return;
  const { armStartRadius, diskHeight, armWidthFactor } = geometry;
  const blobsPerArm = Math.max(2, Math.round(tuning.armBlobsPerArm));
  const sharpness = Math.max(1, tuning.armBlobSharpness);
  const color = armColor(geometry.youngFraction);

  let weightSum = 0;
  for (const arm of geometry.arms) weightSum += arm.weight;
  if (weightSum <= 0) return;

  const totalFlux = emissionScale(geometry) * geometry.armFraction * ARM_BRIGHTNESS * tuning.armFluxBoost;

  for (const arm of geometry.arms) {
    const rStart = armStartRadius * 1.05;
    const rEnd = arm.fadeRadius;
    if (rEnd <= rStart) continue;
    const logStart = Math.log(rStart / armStartRadius);
    const logEnd = Math.log(rEnd / armStartRadius);

    // Centres first, uniform steps in log-radius — every other per-blob
    // quantity (spacing, flux, tangent) is derived from this curve.
    const logRs: number[] = [];
    const radii: number[] = [];
    const angles: number[] = [];
    const centers: Vec3[] = [];
    for (let k = 0; k < blobsPerArm; k++) {
      const logR = logStart + ((logEnd - logStart) * k) / (blobsPerArm - 1);
      const radius = armStartRadius * Math.exp(logR);
      const angle = armRidgeAngle(logR, geometry, arm);
      logRs.push(logR);
      radii.push(radius);
      angles.push(angle);
      centers.push([radius * Math.cos(angle), warpHeight(radius, angle, geometry), radius * Math.sin(angle)]);
    }

    // Per-blob line density x arc-spacing, in one pass since both the flux
    // weight and the along-arm sigma need the same consecutive-centre
    // distance (forward difference, backward at the open end — the arm
    // isn't periodic like a ring).
    const spacings: number[] = [];
    const rawFlux: number[] = [];
    let armRawSum = 0;
    for (let k = 0; k < blobsPerArm; k++) {
      const spacing =
        k < blobsPerArm - 1
          ? distance3(centers[k]!, centers[k + 1]!)
          : distance3(centers[k - 1]!, centers[k]!);
      spacings.push(spacing);
      const fade = armFadeEnvelope(radii[k]!, geometry, arm);
      const clump = armClumpMod(logRs[k]!, geometry, arm);
      const survival = armSurvival(clump, geometry);
      const flux = fade * clump * survival * spacing;
      rawFlux.push(flux);
      armRawSum += flux;
    }
    if (armRawSum <= 0) continue;

    // This arm's share of the total, then each blob's share of THAT — the
    // two normalisations `w_a / sum(w)` and `rawFlux_k / armRawSum` compose
    // into a mixture whose grand total is exactly `totalFlux`.
    const armTargetFlux = totalFlux * (arm.weight / weightSum);

    for (let k = 0; k < blobsPerArm; k++) {
      const radius = radii[k]!;
      const center = centers[k]!;
      const ahead = armCurvePos(radius * 1.01, geometry, arm);
      const behind = armCurvePos(radius * 0.99, geometry, arm);
      const along = normalize3([ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]]);
      const surfacePole = warpSurfaceFrame(radius, angles[k]!, geometry).pole;
      const across = normalize3(cross3(surfacePole, along));
      const pole = cross3(along, across); // re-orthonormalise: surfacePole need not be perpendicular to `along`

      const sigmas = {
        along: (spacings[k]! * RING_AZIMUTHAL_OVERLAP) / sharpness,
        across: (armWidthFactor * radius * 0.5 * tuning.armWidthScale) / sharpness,
        pole: (diskHeight * 0.8) / sharpness,
      };
      const blobFlux = armTargetFlux * (rawFlux[k]! / armRawSum);
      const amplitude = blobFlux / (TAU_ROOT3 * sigmas.along * sigmas.across * sigmas.pole);
      const boundRadius = Math.max(sigmas.along, sigmas.across, sigmas.pole);

      out.push({
        amplitude,
        ...inverseCovarianceFromFrame({ along, across, pole }, sigmas),
        color,
        center,
        boundRadius,
      });
    }
  }
}

/** buildBulge's two radial branches, squashed by flattening / bulgeAxisZ and rotated. */
function pushBulge(
  geometry: GalaxyFieldGeometry,
  out: GalaxyFieldComponent[],
  tuning: GalaxyFieldTuning,
): void {
  if (!tuning.discEnabled || geometry.bulgeFraction <= 0) return;
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
function pushBar(
  geometry: GalaxyFieldGeometry,
  out: GalaxyFieldComponent[],
  tuning: GalaxyFieldTuning,
): void {
  if (!tuning.discEnabled || geometry.barFraction <= 0 || geometry.barLength <= 0) return;
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
function pushHalo(
  geometry: GalaxyFieldGeometry,
  out: GalaxyFieldComponent[],
  tuning: GalaxyFieldTuning,
): void {
  if (!tuning.discEnabled || geometry.haloFraction <= 0) return;
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
 * Component count rides `tuning.ringCount * RING_BLOBS_PER_RING` PLUS
 * `tuning.numArms * tuning.armBlobsPerArm`: at every slider's ceiling that is
 * 4 inner disc + 12*24 ring + 8*64 arm + 2 bulge + 1 bar + 1 halo = 808, under
 * the shader's 1000 (`GALAXY_FIELD_MAX_COMPONENTS`) now that ring blob count
 * is fixed — `FieldSection`'s readout still surfaces `packFieldUniforms`'
 * silent clamp in case a future slider range pushes it back over. That
 * ceiling is a TUNING range, not a target — it's the fixed size of the
 * `comps` uniform array in `milkyWayField/io.wesl` (4000 vec4 slots = 1000
 * components), unrelated to render cost: the splat path draws one quad per
 * component, so cost tracks covered screen area, not component count.
 * Structure the closed form still cannot carry (the lopsided modulation,
 * sub-arm spurs, the irregular bar offset, HII knots) is folded into the
 * axisymmetric populations or dropped; the warp survives as blob placement
 * (`pushDiscRings`, `pushArmRidges`) plus each component's own linearised
 * shear (`shapeOf`) or true surface frame.
 */
export function buildGalaxyFieldMixture(
  geometry: GalaxyFieldGeometry,
  tuning: GalaxyFieldTuning = DEFAULT_GALAXY_FIELD_TUNING,
): readonly GalaxyFieldComponent[] {
  const out: GalaxyFieldComponent[] = [];
  pushDisc(geometry, out, tuning);
  pushDiscRings(geometry, out, tuning);
  pushArmRidges(geometry, out, tuning);
  pushBulge(geometry, out, tuning);
  pushBar(geometry, out, tuning);
  pushHalo(geometry, out, tuning);
  return out;
}
