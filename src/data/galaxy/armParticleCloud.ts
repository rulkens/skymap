/**
 * buildArmParticleCloud — additive-emission twin of the dust particle cloud
 * (`dustParticleCloud.ts`): stochastic Gaussian sprites scattered along each
 * arm's own ridge via the SAME two-level complex/children sampler
 * (`clusteredDiscPlacement.ts`), giving the arms the clumpy, parallaxing
 * variation the dust tier gets from that sampler — no fbm/noise erosion, the
 * clustering itself supplies the texture.
 *
 * Sprite SIZE tracks the LOCAL arm cross-section (`armCrossSigma`), not an
 * absolute parsec span: GMC sizes are near-universal ISM physics, but arm
 * WIDTH is a galaxy-scale property that flares with radius (Reid et al.
 * 2019's measured law), so sizing off the arm's own width reproduces that
 * flare at every radius instead of fattening the inner arm relative to it
 * and starving the outer one.
 *
 * Flux ledger: `totalFlux` is this tier's share of `pushArmRidges`'
 * `armExcessFlux`, already split out by the caller
 * (`galaxyFieldMixture.ts`'s `buildGalaxyFieldMixture` — see that
 * function's and `pushArmRidges`' docblocks for the arithmetic). This module
 * does not re-derive the split.
 *
 * PURITY INVARIANT: pure `(geometry, tuning, totalFlux, seed) -> flat data`,
 * no Math.random/Date/engine state.
 */
import {
  armColor,
  armCrossSigma,
  armFadeEnvelope,
  armRidgeCurvePoint,
  armRidgeFrameAt,
} from './armRidgeGeometry';
import { buildClusteredDiscPlacement, type CloudFrame } from './clusteredDiscPlacement';
import { DISC_SIGMA_RATIOS, DISC_SURFACE_WEIGHTS } from './discSurfaceFit';
import { discLightScaleLength } from '../../utils/galaxy/discLightScaleLength';
import { inverseCovarianceFromFrame } from '../../utils/galaxy/inverseCovarianceFromFrame';
import { mulberry32 } from '../../utils/random/mulberry32';
import type { GalaxyFieldComponent } from '../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';
import type { GalaxyFieldTuning } from '../../@types/galaxy/GalaxyFieldTuning';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Component-budget ceiling for this tier. `galaxyFieldMixture.ts` reserves
 * exactly this many slots (via `pushArmRidges`' `reservedComponents`)
 * before sizing the ridge chain, so a geometry that derives a huge count
 * (see `deriveArmCloudCount`) clamps here rather than overflowing
 * `GALAXY_FIELD_MAX_COMPONENTS`.
 */
export const ARM_CLOUD_MAX_COUNT = 400;

/** Sprite radius as a fraction of the LOCAL `armCrossSigma`, drawn uniform — see this module's docblock for why this is a ratio and not an absolute span. */
const SIZE_MIN_RATIO = 0.35;
const SIZE_MAX_RATIO = 1.0;

/** E[U(SIZE_MIN_RATIO, SIZE_MAX_RATIO)^2] = (a^2+ab+b^2)/3 — the size draw's mean square, feeding `deriveArmCloudCount`'s footprint below. */
const MEAN_SIZE_FRAC_SQ =
  (SIZE_MIN_RATIO ** 2 + SIZE_MIN_RATIO * SIZE_MAX_RATIO + SIZE_MAX_RATIO ** 2) / 3;

/**
 * Ridge samples for the coverage integral below. Unlike `deriveArmBlobCount`'s
 * curvature bound (which needs a fine mesh to catch a tight local wiggle),
 * this integral only sees arc length and local width, both smooth in
 * log-radius, so a coarser sample suffices.
 */
const ARM_COVERAGE_SAMPLES = 48;

/** Complex-level vertical scatter, a fraction of the disc's own height — matches `pushArmRidges`' calibrated arm-population thickness (its own `sigmas.pole = diskHeight * 0.8`). */
const COMPLEX_HEIGHT_RATIO = 0.8;

/** Each sprite is flattened relative to its OWN in-plane extent — same ratio `dustParticleCloud.ts`'s `CLOUD_POLE_RATIO` uses for the analogous GMC-complex shape. */
const SPRITE_POLE_RATIO = 0.6;

/** One complex's child scatter, as a fraction of the LOCAL arm width at a representative radius — mirrors the size draw's own reasoning: arm width sets every other length scale here, not an absolute pc span. */
const COMPLEX_SPREAD_RATIO = 0.6;

const TAU_ROOT3 = (2 * Math.PI) ** 1.5;

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Derives the arm cloud's sprite count from arm GEOMETRY instead of a fixed
 * knob, so a preset's pitch/width/length/arm-count moves the count without a
 * re-tune. The governing criterion is COVERAGE, not `deriveArmBlobCount`'s
 * chord sag: sag bounds a polyline of blobs approximating a curve, but this
 * tier is a scattered sprite cloud, so what matters is how many sprites it
 * takes to fill the arm's own area at a target overlap — the same
 * covering-factor argument `dustParticleCloud.ts` documents for the dust tier
 * (f = N * <sprite footprint> / area).
 *
 * Per arc-length element ds at radius r, the strip area is `2 *
 * armCrossSigma(r) * ds` (fade-weighted, so a faded outer arm doesn't demand
 * sprites nothing will see), and a sprite drawn there has mean footprint `PI
 * * elongation * armCrossSigma(r)^2 * sizeScale^2 * MEAN_SIZE_FRAC_SQ` (the
 * sprite radius is `armCrossSigma(r) * U(SIZE_MIN_RATIO, SIZE_MAX_RATIO) *
 * sizeScale`, so its square's mean is `armCrossSigma(r)^2 * sizeScale^2 *
 * E[U^2]`). Dividing area by footprint cancels one power of armCrossSigma(r),
 * leaving `2 * coverage * fade(r) / (PI * elongation * sizeScale^2 *
 * MEAN_SIZE_FRAC_SQ * armCrossSigma(r)) ds`, evaluated by trapezoid over a
 * dense log-radius ridge sample and summed across arms.
 */
export function deriveArmCloudCount(
  geometry: GalaxyFieldGeometry,
  tuning: GalaxyFieldTuning,
): number {
  if (
    geometry.numArms <= 0 ||
    tuning.armCloudElongation <= 0 ||
    tuning.armCloudSizeScale <= 0 ||
    tuning.armCloudCoverage <= 0
  ) {
    return 0;
  }
  const footprintFactor =
    Math.PI * tuning.armCloudElongation * tuning.armCloudSizeScale ** 2 * MEAN_SIZE_FRAC_SQ;

  let total = 0;
  for (const arm of geometry.arms) {
    const rStart = geometry.armStartRadius * 1.05;
    const rEnd = arm.fadeRadius;
    if (rEnd <= rStart) continue;
    const logStart = Math.log(rStart / geometry.armStartRadius);
    const logEnd = Math.log(rEnd / geometry.armStartRadius);
    const duSample = (logEnd - logStart) / (ARM_COVERAGE_SAMPLES - 1);

    let prevPoint = armRidgeCurvePoint(logStart, geometry, arm);
    let prevIntegrand =
      armFadeEnvelope(rStart, geometry, arm) / armCrossSigma(rStart, geometry, tuning);
    let armIntegral = 0;
    for (let i = 1; i < ARM_COVERAGE_SAMPLES; i++) {
      const logR = logStart + duSample * i;
      const radius = geometry.armStartRadius * Math.exp(logR);
      const point = armRidgeCurvePoint(logR, geometry, arm);
      const integrand =
        armFadeEnvelope(radius, geometry, arm) / armCrossSigma(radius, geometry, tuning);
      armIntegral += 0.5 * (prevIntegrand + integrand) * distance3(prevPoint, point);
      prevPoint = point;
      prevIntegrand = integrand;
    }
    total += (2 * armIntegral) / footprintFactor;
  }
  return Math.min(ARM_CLOUD_MAX_COUNT, Math.max(0, Math.round(tuning.armCloudCoverage * total)));
}

type CloudParticle = { center: Vec3; readonly frame: CloudFrame; readonly radius: number };

export function buildArmParticleCloud(
  geometry: GalaxyFieldGeometry,
  tuning: GalaxyFieldTuning,
  totalFlux: number,
  seed: number,
): readonly GalaxyFieldComponent[] {
  if (geometry.numArms <= 0 || totalFlux <= 0) return [];
  const count = deriveArmCloudCount(geometry, tuning);
  if (count <= 0) return [];

  const color = armColor(geometry.youngFraction);
  const hLight = discLightScaleLength(geometry);
  // A representative radius for the complex-level clustering scale below —
  // per-PARTICLE size still reads the true local armCrossSigma at that
  // particle's own radius (see `drawPayload`); this only sets how tightly
  // children huddle around their complex, which `pushArmRidges` itself also
  // treats as roughly constant along an arm (its own `pole` sigma is a
  // single `diskHeight` figure, not radius-dependent either).
  const complexSpread = armCrossSigma(hLight, geometry, tuning) * COMPLEX_SPREAD_RATIO;
  const sigmaZComplex = geometry.diskHeight * COMPLEX_HEIGHT_RATIO;
  const discWeightSum = DISC_SURFACE_WEIGHTS.reduce((s, w) => s + w, 0);

  const rng = mulberry32(seed ^ 0x41524d43); // "ARMC"

  const particles: CloudParticle[] = buildClusteredDiscPlacement<{ radius: number }>(
    {
      geometry,
      rng,
      count,
      armBias: 1, // this tier IS the arm feature — the smooth-disc fallback only fires when an arm has no valid span
      clumpiness: tuning.armCloudClumpiness,
      complexSpread,
      elongation: tuning.armCloudElongation,
      sigmaZComplex,
      laneFrameAt: (arm, logR) => armRidgeFrameAt(logR, geometry, arm),
      crossLaneSigma: (radius) => armCrossSigma(radius, geometry, tuning),
      discSigmaR: (k) => DISC_SIGMA_RATIOS[k]! * hLight,
      discWeights: DISC_SURFACE_WEIGHTS,
      discWeightSum,
    },
    (childRng, center) => {
      // The along-arm brightness shading (fade/clump/survival) already
      // happened at SAMPLING time — `armFadeEnvelope`'s rejection inside
      // the shared placement sampler biases WHERE particles land, not how
      // bright each one is — so every particle gets an equal R^2 share of
      // the tier's flux below, and the tier reads as smoothly graded rather
      // than clumped on top of its own clustering.
      const radiusAtParticle = Math.hypot(center[0], center[2]);
      const sizeFrac = SIZE_MIN_RATIO + childRng() * (SIZE_MAX_RATIO - SIZE_MIN_RATIO);
      const radius =
        armCrossSigma(radiusAtParticle, geometry, tuning) * sizeFrac * tuning.armCloudSizeScale;
      return { radius };
    },
  );

  let sumR2 = 0;
  for (const p of particles) sumR2 += p.radius * p.radius;
  if (!(sumR2 > 0)) return [];
  const fluxPerR2 = totalFlux / sumR2;

  return particles.map((p) => {
    const sigmas = {
      along: p.radius * tuning.armCloudElongation,
      across: p.radius,
      pole: p.radius * SPRITE_POLE_RATIO,
    };
    const flux = fluxPerR2 * p.radius * p.radius;
    const amplitude = flux / (TAU_ROOT3 * sigmas.along * sigmas.across * sigmas.pole);
    return {
      amplitude,
      ...inverseCovarianceFromFrame(p.frame, sigmas),
      color,
      center: p.center,
      boundRadius: Math.max(sigmas.along, sigmas.across, sigmas.pole),
    };
  });
}
