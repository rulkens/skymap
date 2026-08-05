/**
 * buildGalaxyFieldMixture — the Gaussian mixture the analytic field pass
 * integrates in closed form, derived from the SAME geometry the sprite
 * generator ran with, so the two renderings of one galaxy agree by
 * construction and every preset gets its own field.
 *
 * Each sigma mirrors a `milkyWay/sprites/generate.wesl` builder, cited on the line;
 * each amplitude is its population's `light` fraction over the component's own
 * Gaussian volume, times the galaxy's `luminosity`. Both are physical, so
 * neither an LOD tier nor a sprite constant can move them. Colours stay
 * eyeball values.
 * Imports `armParticleCloud.ts` to reserve the
 * arm cloud's component budget before the ridge chain spends it, with no
 * third caller (the engine) to reserve it for them instead — the shared
 * ridge-curve/width/colour vocabulary both sides need lives in
 * `armRidgeGeometry.ts`, so this import is one-directional.
 */

import { buildArmParticleCloud, deriveArmCloudCount } from './armParticleCloud';
import {
  ARM_SPAN_START_FRAC,
  armColor,
  armCrossSigma,
  armExcessSurfaceShape,
  armFadeEnvelope,
  armRidgeCurvePoint,
  armRidgeFrameAt,
  cross3,
} from './armRidgeGeometry';
import { DEFAULT_GALAXY_SF_MAP_PARAMS } from './defaultGalaxySfMapParams';
import { DISC_SIGMA_RATIOS, DISC_SURFACE_WEIGHTS } from './discSurfaceFit';
import { discLightScaleLength } from '../../../../utils/galaxy/discLightScaleLength';
import { discWarpShear } from '../../../../utils/galaxy/discWarpShear';
import { galaxyFieldInverseCovariance } from '../../../../utils/galaxy/galaxyFieldInverseCovariance';
import { inverseCovarianceFromFrame } from '../../../../utils/galaxy/inverseCovarianceFromFrame';
import { spheroidEmissionSigma } from '../../../../utils/galaxy/spheroidEmissionSigma';
import { warpHeight } from '../../../../utils/galaxy/warpHeight';
import { warpSurfaceFrame } from '../../../../utils/galaxy/warpSurfaceFrame';
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldComponent } from '../../../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { Vec3 } from '../../../../@types/math/Vec3';

/**
 * PER-GALAXY component cap. Not a shader limit: `io.wesl`'s `comps` is a
 * runtime-sized `array<vec4<f32>>` storage binding whose backing buffer
 * `createGalaxyEngine.ts` grows on demand, so this bounds ONE mixture, not
 * the scene (N background extras sum past it freely).
 *
 * Nor is it a fill-cost ceiling any more: the splat path draws one quad per
 * component covering only that Gaussian's own silhouette, so cost tracks
 * covered screen AREA — which the tiers' own coverage/contrast knobs set —
 * rather than component count. What a component still costs is one instance
 * and 64 B; the cap exists so a pathological geometry cannot make either
 * unbounded.
 *
 * `pushArmRidges` derives its per-arm blob count from ridge curvature and
 * budgets it against this cap (`perArmBudget`, net of the arm cloud's
 * reservation), so arm overflow is impossible by construction;
 * `packFieldUniforms` still CLAMPS silently if some other population pushes
 * past it.
 */
export const GALAXY_FIELD_MAX_COMPONENTS = 3000;

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
  geometry: GalaxyDescription,
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

const TAU_ROOT = Math.sqrt(2 * Math.PI);
const TAU_ROOT3 = (2 * Math.PI) ** 1.5;

const DISC_COLOR = [0.86, 0.9, 1.0] as const;
const HALO_COLOR = [1.0, 0.92, 0.78] as const;
const BAR_COLOR = [1.0, 0.84, 0.62] as const;
const BULGE_COLOR = [1.0, 0.8, 0.55] as const;

/** `buildDisk`'s vertical flare: diskHeight * (0.6 + bulgeRadius/(R + bulgeRadius)). */
const DISC_FLARE_FLOOR = 0.6;

/**
 * The disc's azimuthally-averaged surface brightness at R, from the disc
 * family's OWN total flux (`discFlux`, accumulated at push time — see
 * `buildGalaxyFieldMixture`) and its light-weighted scale length: Sigma(R) =
 * F / (2*pi*h^2) * exp(-R/h), normalised so integral(Sigma * 2*pi*R dR) = F.
 * `pushArmRidges` treats this as the interarm floor the contrast ratio K is
 * measured against.
 */
function discSurfaceBrightness(radius: number, discFlux: number, hLight: number): number {
  return (discFlux / (2 * Math.PI * hLight * hLight)) * Math.exp(-radius / hLight);
}

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
 * Gaussian is exact — the warp lives entirely in `pushWarpedOuterDisc`.
 *
 * Freudenreich 1998 gives the real Milky Way a 2.605 kpc disc scale length
 * (1.563 generator units) where the MW preset samples 3.281. That gap is a
 * PRESET calibration question and a deliberate separate decision — this
 * mixture tracks whatever the generator was handed, so do not hardcode F98's
 * numbers back in here.
 */
function pushDisc(
  geometry: GalaxyDescription,
  out: GalaxyFieldComponent[],
  tuning: GalaxyFieldTuning,
): number {
  if (!tuning.disc.enabled || geometry.light.disc <= 0) return 0;
  const scaleLen = discLightScaleLength(geometry);
  const central = geometry.light.disc / (2 * Math.PI * scaleLen * scaleLen);
  let fluxTotal = 0;
  for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
    const sigmaR = DISC_SIGMA_RATIOS[i]! * scaleLen;
    const sigmaPole =
      geometry.diskHeight *
      (DISC_FLARE_FLOOR + geometry.bulgeRadius / (sigmaR + geometry.bulgeRadius));
    // Divided by sigmaPole alone: the fitted weights are SURFACE densities,
    // and it is the surface density the flare must leave untouched.
    const amplitude =
      (geometry.luminosity * DISC_SURFACE_WEIGHTS[i]! * central) / (sigmaPole * TAU_ROOT);
    out.push({
      amplitude,
      ...shapeOf(geometry, sigmaR, sigmaPole, sigmaR, 0),
      color: DISC_COLOR,
      center: ORIGIN,
    });
    // This component's own 3D integral — summed rather than hand-derived
    // from `light.disc`, so `pushArmRidges`' contrast ledger tracks
    // whatever flux actually landed in `out`, not a recomputation of it.
    fluxTotal += amplitude * TAU_ROOT3 * sigmaR * sigmaR * sigmaPole;
  }
  return fluxTotal;
}

/**
 * Ring geometry the two removed disc Gaussians (sigma ratios 3.4h, 5.0h) are
 * replaced by — the outer disc's warp support, not a tunable layer. All of
 * these, `WARP_RING_COUNT` included, are frozen: `pushWarpedOuterDisc` places
 * that many locally-linear ring patches within this band.
 *
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
 * ringSpacing is the band divided across `WARP_RING_COUNT` rings (see
 * `pushWarpedOuterDisc`). Value inherited from when the ring count was a
 * live 2-ring default (spacing 0.23) reproducing the old calibrated sigma of
 * 0.13*outerRadius: 0.13 / 0.23 = 13/23 — kept as-is now that the count sits
 * fixed at a higher value; the annulus split still tracks the disc profile.
 */
const RING_RADIAL_OVERLAP = 13 / 23;

/**
 * Ring count, frozen at the visually settled value. NOT a smoothness dial to
 * raise: the derived sigma above narrows with spacing, so more rings sharpen
 * the band's inner edge into a visible seam against the origin discs (8 rings
 * showed exactly that). Two wide rings blend into their neighbours; warp
 * fidelity inside the band is bounded by ring count, and at 2 the settled
 * look accepts that trade.
 */
export const WARP_RING_COUNT = 2;

/**
 * `buildGalaxyFieldMixture`'s default when no tuning is supplied.
 * `galaxy-renderer`'s control panel is the only other producer of a
 * `GalaxyFieldTuning`, built by patching one section of this object.
 */
export const DEFAULT_GALAXY_FIELD_TUNING: GalaxyFieldTuning = {
  disc: { enabled: true },
  // Hand-calibrated by eye in the galaxy-renderer tool, above the measured
  // Milky Way figures each knob's own docblock quotes (widthScale 1 = Reid+19's
  // maser law, contrast 1.3 = the MW's measured K). The measurements bound what
  // is PHYSICAL, not what the shipped image uses.
  arms: {
    enabled: true,
    widthScale: 2.3,
    contrast: 2.2,
    // Calibration of the value, not of the law (`GalaxyArmTuning.excessScaleRatio`):
    // at 1, contrast flat with radius, the Milky Way preset's ridge chain puts
    // only 5% of its flux beyond r=8 of a 10.5-unit disc — arms that stop
    // before the disc does. Above 1 lifts that; how far is a look call.
    //
    // 2 is that look call answered against a measured obstacle rather than by
    // taste alone: `pushWarpedOuterDisc` banks 7.4% of the disc's light into a
    // 0.75-0.98 R_out annulus, so the interarm floor the eye divides by runs
    // 2.2x the exponential the contrast law is written against, and K delivers
    // under half its nominal contrast out there. This buys the reach back from
    // the numerator. Widening that band is the fix that treats the cause.
    excessScaleRatio: 2,
    blobSharpness: 1,
    cloud: {
      enabled: true,
      // The tier is under active tuning, so it defaults ON at a visible share
      // rather than 0 — a new section whose every slider does nothing until
      // some OTHER slider is raised first reads as broken. This is a deliberate
      // boot-image change, not a neutral default.
      share: 0.8,
      coverage: 3.5,
      // Near the top of the 0..3 range, where the placement sampler's bounded
      // rejection starts giving up: this ships WITH the ~17%-exhausted,
      // ~4%-inward drift `GalaxyArmCloudTuning.radialBias` documents, as the
      // price of pulling the sprites clear of the bulge glare.
      radialBias: 2.9,
      // Independent scattering: the one setting at which `coverage` means
      // literally what it says (`GalaxyArmCloudTuning.coverage`).
      clumpiness: 0,
      sizeScale: 0.65,
      elongation: 3,
    },
  },
  dust: {
    enabled: true,
    // Inert wherever no automaton runs: seeding needs a sampled map handed in,
    // and both consumers fall back to their unseeded envelope without one.
    sfMapSeeding: true,
  },
  hii: {
    enabled: true,
    brightness: 1,
    radiusScale: 1,
    // Thin enough that the shell reads as a front rather than a fuzzy ball;
    // the limb brightening is geometric, so this is the one knob that decides
    // how sharp the rim can get.
    shellThickness: 0.25,
    clusterStrength: 0.6,
    // Under 1 so the lit wall sits inside the swept dust rather than on it.
    cavityScale: 0.8,
    // Map-seeded by default on this branch — the whole point is seeing dust
    // and knots driven by the same automaton run. 0 recovers the arm-ridge
    // catalog byte-identically.
    sfMapSeeding: 1,
  },
  sfMap: DEFAULT_GALAXY_SF_MAP_PARAMS,
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
    (_, r) =>
      discSurfaceIntegral(bounds[r + 1]!, h) - discSurfaceIntegral(Math.max(0, bounds[r]!), h),
  );
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

/**
 * The outer disc's warp support. A single anisotropic Gaussian cannot bend,
 * so this piecewise-linearises the warped outer disc into `WARP_RING_COUNT`
 * rings, each a locally-linear patch of the warp surface — an implementation
 * detail of the disc, not a layer of their own. Blobs sit at their OWN true
 * warped height (`warpHeight`) rather than at a sheared origin-centred
 * position: the warp is flat inside `warpStartRadius` and only then bends as
 * rel^2, a shape no shear of an origin-centred blob can reproduce.
 *
 * Each ring's frame comes from `warpSurfaceFrame` — the real tangent plane
 * at that ring's (radius, azimuth) — NOT from `discWarpShear`, which is the
 * chord to the warped ring (slope of a plane through the ORIGIN) rather than
 * its tangent: with the warp growing as rel^2 the tangent is
 * `2/(R - warpStartRadius)` against the chord's `1/R`, several times steeper
 * at a typical ring radius. Blobs tilted by the chord read as flat pancakes
 * fanning out of the disc instead of a continuous bending sheet. `discWarpShear`
 * still linearises each blob's OWN tilt about its own centre (via `shapeOf`
 * elsewhere in this file), which is a different, legitimate use.
 *
 * Each ring's flux is that ring's own share of `Σ(R) = exp(-R/diskScaleLen)`
 * integrated over its annulus (see `ringAnnulusWeights` above), so the split
 * follows the disc's real profile rather than a hand-picked ratio.
 */
function pushWarpedOuterDisc(
  geometry: GalaxyDescription,
  out: GalaxyFieldComponent[],
  tuning: GalaxyFieldTuning,
): number {
  if (!tuning.disc.enabled || geometry.light.disc <= 0) return 0;
  const { outerRadius, bulgeRadius, diskHeight, diskScaleLen } = geometry;
  const blobsPerRing = RING_BLOBS_PER_RING;
  const totalFlux = geometry.luminosity * geometry.light.disc * REMOVED_OUTER_DISC_WEIGHT;

  // One spacing drives both the radial sigma and the annulus weights below —
  // the band split N-1 ways across the WARP_RING_COUNT rings.
  const spacingFrac = (RING_OUTER_RADIUS_FRAC - RING_INNER_RADIUS_FRAC) / (WARP_RING_COUNT - 1);
  const radialSigma = spacingFrac * outerRadius * RING_RADIAL_OVERLAP;

  const radii: number[] = [];
  for (let r = 0; r < WARP_RING_COUNT; r++) {
    radii.push((RING_INNER_RADIUS_FRAC + spacingFrac * r) * outerRadius);
  }
  const weights = ringAnnulusWeights(radii, spacingFrac * outerRadius, diskScaleLen);

  for (let r = 0; r < WARP_RING_COUNT; r++) {
    const radius = radii[r]!;
    const blobFlux = (totalFlux * weights[r]!) / blobsPerRing;
    const sigmas = {
      along: ((2 * Math.PI * radius) / blobsPerRing) * RING_AZIMUTHAL_OVERLAP,
      across: radialSigma,
      pole: diskHeight * (DISC_FLARE_FLOOR + bulgeRadius / (radius + bulgeRadius)),
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
  return totalFlux;
}

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** armStarSample's along-arm low-frequency modulation; 1 (no modulation) when clumpAmount is 0. */
function armClumpMod(logR: number, geometry: GalaxyDescription, arm: GalaxyFieldArmRecord): number {
  if (geometry.clumpAmount <= 0) return 1;
  const noise =
    Math.sin(logR * arm.clumpF1 + arm.clumpP1) * 0.6 +
    Math.sin(logR * arm.clumpF2 + arm.clumpP2) * 0.4;
  return 1 - geometry.clumpAmount * (0.5 - 0.5 * noise);
}

/** armStarSample's gap-survival fraction for non-HII stars — the smooth stand-in for the WGSL gate's coin flip. */
function armSurvival(clumpMod: number, geometry: GalaxyDescription): number {
  return geometry.clumpAmount > 0 ? Math.min(1, 0.4 + 0.6 * clumpMod) : 1;
}

/** Points to densely re-sample the ridge at, to estimate curvature — see `deriveArmBlobCount`. */
const ARM_CURVATURE_SAMPLES = 192;

/**
 * Straight-chord sag tolerance, as a fraction of the local cross-arm sigma:
 * sag = (chord step)^2 * curvature / 8 is the standard circular-arc/chord
 * deviation, and bounding it against sigma_across rather than an absolute
 * length means a narrow, tightly-wound arm earns more blobs while a broad,
 * gentle one doesn't pay for headroom it doesn't need. Calibrated so the
 * Milky Way preset lands near the previously approved ~28 blobs/arm, and
 * tightening pitch or narrowing width raises the count automatically.
 */
const ARM_SAG_TOLERANCE = 0.3;

/** Floor below which an arm reads as a dashed line no matter how straight it is. */
const ARM_BLOBS_MIN = 12;

/**
 * Derives this arm's blob count from ridge curvature instead of a fixed
 * tuning knob: densely sample the ridge, and at each interior sample use the
 * Menger curvature kappa of its neighbouring triple (kappa = 4*area /
 * (|a||b||c|), the reciprocal of the circumradius) plus a central-difference
 * ds/du to bound the largest uniform-in-logR blob spacing whose straight-line
 * chord would sag past ARM_SAG_TOLERANCE * sigma_across at that point. The
 * tightest interval wins; `perArmBudget` is the hard cap under
 * GALAXY_FIELD_MAX_COMPONENTS this arm may spend (see call site).
 */
function deriveArmBlobCount(
  logStart: number,
  logEnd: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
  tuning: GalaxyFieldTuning,
  perArmBudget: number,
): number {
  const totalLogSpan = logEnd - logStart;
  const n = ARM_CURVATURE_SAMPLES;
  const duSample = totalLogSpan / (n - 1);
  const points: Vec3[] = [];
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    const logR = logStart + duSample * i;
    points.push(armRidgeCurvePoint(logR, geometry, arm));
    radii.push(geometry.armStartRadius * Math.exp(logR));
  }

  let duMax = Infinity;
  for (let i = 1; i < n - 1; i++) {
    const p0 = points[i - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const sideA = distance3(p0, p1);
    const sideB = distance3(p1, p2);
    const sideC = distance3(p0, p2); // also the central-difference chord for ds/du at i
    const dsDu = sideC / (2 * duSample);
    if (dsDu <= 1e-9) continue; // stationary point — no arc-length bound here

    const v1: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const v2: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const cross = cross3(v1, v2);
    const area = 0.5 * Math.hypot(cross[0], cross[1], cross[2]);
    const kappa =
      sideA > 1e-12 && sideB > 1e-12 && sideC > 1e-12 ? (4 * area) / (sideA * sideB * sideC) : 0;
    if (kappa <= 1e-9) continue; // straight here — no curvature bound, any spacing sags 0

    const sigma = armCrossSigma(radii[i]!, geometry, tuning);
    // sag = (dsDu * du)^2 * kappa / 8 <= tol * sigma, solved for du.
    const duBound = Math.sqrt((8 * ARM_SAG_TOLERANCE * sigma) / kappa) / dsDu;
    duMax = Math.min(duMax, duBound);
  }

  const nArm = Number.isFinite(duMax) ? Math.ceil(totalLogSpan / duMax) + 1 : ARM_BLOBS_MIN;
  return Math.min(perArmBudget, Math.max(ARM_BLOBS_MIN, nArm));
}

/**
 * The `age` scaling of `GalaxyArmTuning.contrast`, 0 = young gas arm, 1 = old
 * stellar arm: the floor keeps a young arm faintly present in old-star light
 * rather than absent, and the span puts the full contrast at age 1.
 */
const ARM_AGE_CONTRAST_FLOOR = 0.25;
const ARM_AGE_CONTRAST_SPAN = 0.75;

/**
 * `tuning.arms.cloud.share`, clamped to a valid probability — the share the
 * tuning ASKS for. What the cloud actually carries is `buildGalaxyFieldMixture`'s
 * `cloudShare`, which is this only when a cloud will really be built.
 */
export function clampedArmCloudShare(tuning: GalaxyFieldTuning): number {
  return Math.min(1, Math.max(0, tuning.arms.cloud.share));
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
 * Flux bookkeeping: an arm's flux here is not a budget of its own but an
 * EXCESS over the azimuthally averaged disc — K_i (this arm's contrast, scaled
 * by its own age) times the disc's own local surface brightness, which
 * `buildGalaxyFieldMixture` then debits back out of the disc components. Why
 * the excess is defined that way: `GalaxyArmTuning.contrast`.
 *
 * The returned total is the FULL excess regardless of `cloudShare`: this
 * function renders only `1 - cloudShare` of it, and `buildGalaxyFieldMixture`
 * hands the rest to `armParticleCloud.ts` as that tier's own flux budget — the
 * two rendered totals still sum to this return value, so the disc debit (which
 * uses the full value) stays correct either way. The caller passes the share
 * the cloud will REALLY carry, never the raw tuning: deriving it here instead
 * let the ridge chain give away a share to a cloud the caller had already
 * decided not to build.
 */
function pushArmRidges(
  geometry: GalaxyDescription,
  out: GalaxyFieldComponent[],
  tuning: GalaxyFieldTuning,
  discFlux: number,
  reservedComponents: number,
  cloudShare: number,
): number {
  if (!tuning.arms.enabled || geometry.numArms <= 0 || discFlux <= 0) return 0;
  const { armStartRadius, diskHeight } = geometry;
  const sharpness = Math.max(1, tuning.arms.blobSharpness);
  const color = armColor(geometry.youngFraction);
  const hLight = discLightScaleLength(geometry);
  const K = tuning.arms.contrast;
  // The RENDERED share of each blob's flux — `armExcessFlux` below stays the
  // FULL, unscaled excess (the disc debit and the particle cloud's own share
  // both key off that full total; see `buildGalaxyFieldMixture`'s docblock).
  const renderedShare = 1 - cloudShare;

  // Components already pushed PLUS the caller's reservation (the disc is
  // built in a local array and appended after the arms — see
  // `buildGalaxyFieldMixture`) bound what arms may still spend, split evenly
  // across them — makes cap overflow structurally impossible rather than a
  // silent packFieldUniforms clamp.
  const perArmBudget = Math.floor(
    (GALAXY_FIELD_MAX_COMPONENTS - out.length - reservedComponents) / geometry.numArms,
  );

  let armExcessFlux = 0;

  for (const arm of geometry.arms) {
    const rStart = armStartRadius * ARM_SPAN_START_FRAC;
    const rEnd = arm.fadeRadius;
    if (rEnd <= rStart) continue;
    const logStart = Math.log(rStart / armStartRadius);
    const logEnd = Math.log(rEnd / armStartRadius);
    const blobsPerArm = deriveArmBlobCount(logStart, logEnd, geometry, arm, tuning, perArmBudget);
    const Ki = 1 + (K - 1) * (ARM_AGE_CONTRAST_FLOOR + ARM_AGE_CONTRAST_SPAN * arm.age);

    // Centres first, uniform steps in log-radius — every other per-blob
    // quantity (spacing, flux, tangent) is derived from this curve.
    const logRs: number[] = [];
    const radii: number[] = [];
    const centers: Vec3[] = [];
    for (let k = 0; k < blobsPerArm; k++) {
      const logR = logStart + ((logEnd - logStart) * k) / (blobsPerArm - 1);
      logRs.push(logR);
      radii.push(armStartRadius * Math.exp(logR));
      centers.push(armRidgeCurvePoint(logR, geometry, arm));
    }

    // Arc-spacing (for both the along-arm sigma and Delta s_k below) and the
    // fade/clump/survival modulation, in one pass — forward difference,
    // backward at the open end, since the arm isn't periodic like a ring.
    const spacings: number[] = [];
    const mods: number[] = [];
    let modSum = 0;
    for (let k = 0; k < blobsPerArm; k++) {
      const spacing =
        k < blobsPerArm - 1
          ? distance3(centers[k]!, centers[k + 1]!)
          : distance3(centers[k - 1]!, centers[k]!);
      spacings.push(spacing);
      const fade = armFadeEnvelope(radii[k]!, geometry, arm);
      const clump = armClumpMod(logRs[k]!, geometry, arm);
      const survival = armSurvival(clump, geometry);
      const mod = fade * clump * survival;
      mods.push(mod);
      modSum += mod;
    }
    if (modSum <= 0) continue;
    // Renormalised to mean 1 so the modulation shapes the arm's brightness
    // along its length without moving its calibrated total (the contrast
    // law below, not this shape, sets that total).
    const modMean = modSum / blobsPerArm;

    for (let k = 0; k < blobsPerArm; k++) {
      const radius = radii[k]!;
      const center = centers[k]!;
      const { along, across, pole } = armRidgeFrameAt(logRs[k]!, geometry, arm);

      const sigmaAcross = armCrossSigma(radius, geometry, tuning);
      const sigmas = {
        along: (spacings[k]! * RING_AZIMUTHAL_OVERLAP) / sharpness,
        across: sigmaAcross / sharpness,
        pole: (diskHeight * 0.8) / sharpness,
      };
      // Sigma_disc: the interarm floor this arm's excess is measured against,
      // read at the PIVOT radius and carried outward by the arm's own radial
      // shape rather than the disc's (`GalaxyArmTuning.excessScaleRatio`).
      // lambda_i(R) is then the Gaussian tube's cross-section integral of that
      // excess — sqrt(2*pi)*sigmaAcross is a 1D Gaussian's own integral.
      const sigmaDisc =
        discSurfaceBrightness(geometry.armFullRadius, discFlux, hLight) *
        armExcessSurfaceShape(radius, geometry, hLight, tuning.arms.excessScaleRatio);
      const lambda = (Ki - 1) * sigmaDisc * TAU_ROOT * sigmaAcross;
      const blobFlux = lambda * spacings[k]! * (mods[k]! / modMean);
      armExcessFlux += blobFlux; // full excess — see `renderedShare`'s comment above
      const amplitude =
        (blobFlux * renderedShare) / (TAU_ROOT3 * sigmas.along * sigmas.across * sigmas.pole);
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
  return armExcessFlux;
}

/** buildBulge's two radial branches, squashed by flattening / bulgeAxisZ and rotated. */
function pushBulge(
  geometry: GalaxyDescription,
  out: GalaxyFieldComponent[],
  tuning: GalaxyFieldTuning,
): void {
  if (!tuning.disc.enabled || geometry.light.bulge <= 0) return;
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
  const emission = geometry.luminosity * geometry.light.bulge;
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
  geometry: GalaxyDescription,
  out: GalaxyFieldComponent[],
  tuning: GalaxyFieldTuning,
): void {
  if (!tuning.disc.enabled || geometry.light.bar <= 0 || geometry.barLength <= 0) return;
  const sigmaAlong = BAR_ALONG_RATIO * geometry.barLength;
  const sigmaAcross = BAR_ACROSS_RATIO * geometry.barLength;
  const sigmaPole = BAR_HEIGHT_FACTOR * geometry.diskHeight;
  out.push({
    amplitude:
      (geometry.luminosity * geometry.light.bar) /
      (TAU_ROOT3 * sigmaAlong * sigmaAcross * sigmaPole),
    ...shapeOf(geometry, sigmaAlong, sigmaPole, sigmaAcross, geometry.barTiltRad),
    color: BAR_COLOR,
    center: ORIGIN,
  });
}

/** buildHalo — the faint envelope, squashed along the pole by the same flattening. */
function pushHalo(
  geometry: GalaxyDescription,
  out: GalaxyFieldComponent[],
  tuning: GalaxyFieldTuning,
): void {
  if (!tuning.disc.enabled || geometry.light.halo <= 0) return;
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
      (geometry.luminosity * geometry.light.halo) / (TAU_ROOT3 * sigma * sigma * sigmaPole),
    ...shapeOf(geometry, sigma, sigmaPole, sigma, 0),
    color: HALO_COLOR,
    center: ORIGIN,
  });
}

/**
 * Whatever the debit cannot take out of the disc, the arms emit anyway — so
 * this fraction is the point past which the mixture stops conserving flux
 * (`galaxyFieldFluxLedger.test.ts`), not a soft limiter. It is set high enough
 * that only a broken parameterization (an excess several times the disc) can
 * reach it, and no higher: the residual disc must stay clearly positive rather
 * than going to zero or inverting.
 *
 * It was 0.5 while the arm defaults sat at the MW's measured K; the shipped
 * contrast is now well past that, and ngc6946's excess reaches 0.57 of its
 * disc, which leaked 5.8% of the galaxy's light before this moved.
 */
const ARM_DISC_DEBIT_CLAMP_FRACTION = 0.9;

/**
 * Component count is `WARP_RING_COUNT * RING_BLOBS_PER_RING` (192, fixed)
 * PLUS each arm's own `deriveArmBlobCount`, individually budget-clamped
 * against `GALAXY_FIELD_MAX_COMPONENTS` so the grand total can never exceed
 * that per-galaxy cap (see its own docblock for what the cap does and does
 * not bound). Structure the closed
 * form still cannot carry (the lopsided modulation, sub-arm spurs, the
 * irregular bar offset, HII knots) is folded into the axisymmetric
 * populations or dropped; the warp survives as blob placement
 * (`pushWarpedOuterDisc`, `pushArmRidges`) plus each component's own
 * linearised shear (`shapeOf`) or true surface frame.
 *
 * `armParticleCloud.ts`'s sprites share this same cap: `armCloudReserve`
 * below is computed BEFORE `pushArmRidges` runs and folded into its
 * `reservedComponents`, so the ridge chain's own budget shrinks to leave
 * room rather than the two tiers racing for the same slots. HII regions
 * (`hiiRegions.ts`) do NOT compete for this cap any more — they render into
 * their own target off their own buffer (`createGalaxyEngine.ts`'s
 * `hiiTex`/`hiiCompsBuf`, research doc §18.1), so they never reserve any of
 * it.
 */
export function buildGalaxyFieldMixture(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning = DEFAULT_GALAXY_FIELD_TUNING,
): readonly GalaxyFieldComponent[] {
  const out: GalaxyFieldComponent[] = [];

  // `pushArmRidges`' contrast law needs a disc to measure its excess against
  // even when the FLUX FIELD pill has hidden the disc itself — the disc
  // components go into a LOCAL array, built with the disc pill forced on, and
  // only land in `out` (below) when the pill says so. Bulge/bar/halo have no
  // such independent pill and stay gated on `tuning.disc.enabled` directly:
  // the FLUX FIELD pill is the smooth-field master for them; arms are the
  // only layer with a pill of their own.
  const discOut: GalaxyFieldComponent[] = [];
  const discTuning: GalaxyFieldTuning = tuning.disc.enabled
    ? tuning
    : { ...tuning, disc: { ...tuning.disc, enabled: true } };
  const discFlux =
    pushDisc(geometry, discOut, discTuning) + pushWarpedOuterDisc(geometry, discOut, discTuning);

  // The arm excess is debited back out of the disc components just pushed
  // (`GalaxyArmTuning.contrast`). Measured against the disc the galaxy WOULD
  // have, arms keep their calibrated flux even with the disc itself hidden.
  // Reservation only when the disc will actually land in `out` — with the
  // disc hidden its components never spend the cap, so arms may use it all.
  // The particle cloud's own budget is reserved the SAME way: computed
  // before `pushArmRidges` runs so its `perArmBudget` shrinks to leave room,
  // rather than the cloud starving the ridge chain (or vice versa) via a
  // silent `packFieldUniforms` clamp. `deriveArmCloudCount` is also what
  // `buildArmParticleCloud` itself calls to size the cloud it actually
  // builds below, so the reservation and the build can never disagree.
  const armCloudCount =
    tuning.arms.enabled && tuning.arms.cloud.enabled && clampedArmCloudShare(tuning) > 0
      ? deriveArmCloudCount(geometry, tuning)
      : 0;
  // That SAME count decides the flux split, so a cloud that will not be built
  // — pill off, share 0, or a coverage integral rounding to no sprites — hands
  // its share back to the ridge chain. The disc is debited the whole excess
  // either way, so a share promised to a tier that never runs is light nothing
  // emits.
  const cloudShare = armCloudCount > 0 ? clampedArmCloudShare(tuning) : 0;
  const armExcessFlux = pushArmRidges(
    geometry,
    out,
    tuning,
    discFlux,
    (tuning.disc.enabled ? discOut.length : 0) + armCloudCount,
    cloudShare,
  );
  if (discFlux > 0 && armExcessFlux > 0) {
    const debit = Math.min(armExcessFlux, discFlux * ARM_DISC_DEBIT_CLAMP_FRACTION);
    const scale = (discFlux - debit) / discFlux;
    for (let i = 0; i < discOut.length; i++) {
      discOut[i] = { ...discOut[i]!, amplitude: discOut[i]!.amplitude * scale };
    }
  }
  if (tuning.disc.enabled) out.push(...discOut);

  const cloudFlux = armExcessFlux * cloudShare;
  if (cloudFlux > 0) {
    out.push(...buildArmParticleCloud(geometry, tuning, cloudFlux, geometry.seed));
  }

  pushBulge(geometry, out, tuning);
  pushBar(geometry, out, tuning);
  pushHalo(geometry, out, tuning);
  return out;
}
