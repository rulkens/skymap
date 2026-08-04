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
  ARM_SPAN_START_FRAC,
  armColor,
  armCrossSigma,
  armExcessSurfaceShape,
  armFadeEnvelope,
  armRidgeCurvePoint,
  armRidgeFrameAt,
} from './armRidgeGeometry';
import { buildClusteredDiscPlacement, type CloudFrame } from './clusteredDiscPlacement';
import { DISC_SIGMA_RATIOS, DISC_SURFACE_WEIGHTS } from './discSurfaceFit';
import { discLightScaleLength } from '../../../../utils/galaxy/discLightScaleLength';
import { inverseCovarianceFromFrame } from '../../../../utils/galaxy/inverseCovarianceFromFrame';
import { mulberry32 } from '../../../../utils/random/mulberry32';
import type { GalaxyFieldComponent } from '../../../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { Vec3 } from '../../../../@types/math/Vec3';

/**
 * Component-budget ceiling for this tier. `galaxyFieldMixture.ts` reserves
 * exactly this many slots (via `pushArmRidges`' `reservedComponents`)
 * before sizing the ridge chain, so a geometry that derives a huge count
 * (see `deriveArmCloudCount`) clamps here rather than overflowing
 * `GALAXY_FIELD_MAX_COMPONENTS`.
 *
 * Sized so the COVERAGE knob leads and this stays a backstop across the
 * slider's range — at 400 the Milky Way preset saturated at coverage ~2.7,
 * which read as the slider going dead rather than as a budget being hit.
 * Clustered placement is why coverage has to reach so high: the sampler
 * huddles `1 + 15*clumpiness` sprites into one complex, so the sprites
 * `deriveArmCloudCount` counts overlap heavily instead of tiling the arm,
 * and the covering factor it solves for is only literal at clumpiness 0.
 */
export const ARM_CLOUD_MAX_COUNT = 2000;

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
 *
 * `cloud.radialBias` is deliberately NOT in this integral: it redistributes
 * the sprites rather than resizing the arm, so the whole-arm demand this
 * solves for is the same. The practical consequence is that raising the bias
 * over-covers the outer arm and under-covers the inner one at a fixed
 * `coverage` — which is the point, and is why a tilted cloud needs a LOWER
 * coverage setting to read as filled where it counts.
 */
export function deriveArmCloudCount(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): number {
  if (
    geometry.numArms <= 0 ||
    tuning.arms.cloud.elongation <= 0 ||
    tuning.arms.cloud.sizeScale <= 0 ||
    tuning.arms.cloud.coverage <= 0
  ) {
    return 0;
  }
  const footprintFactor =
    Math.PI * tuning.arms.cloud.elongation * tuning.arms.cloud.sizeScale ** 2 * MEAN_SIZE_FRAC_SQ;

  let total = 0;
  for (const arm of geometry.arms) {
    const rStart = geometry.armStartRadius * ARM_SPAN_START_FRAC;
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
  return Math.min(ARM_CLOUD_MAX_COUNT, Math.max(0, Math.round(tuning.arms.cloud.coverage * total)));
}

type CloudParticle = { center: Vec3; readonly frame: CloudFrame; readonly radius: number };

/**
 * Reference radius for the radial tilt: the outermost arm's own fade radius,
 * so `(radius / this) ** bias` never exceeds 1 anywhere a complex can be
 * proposed. That bound is load-bearing — the sampler rejection-tests against
 * this weight, and a weight above 1 silently flattens into a uniform tail
 * instead of erroring.
 *
 * ONE reference across all arms, not each arm's own fadeRadius, so the tilt
 * cannot redistribute light BETWEEN arms of different lengths: a per-arm
 * reference would normalise each arm's tilt separately and hand the short
 * arms a brightness offset that grows with `bias`.
 */
function tiltReferenceRadius(geometry: GalaxyDescription): number {
  let max = 0;
  for (const arm of geometry.arms) max = Math.max(max, arm.fadeRadius);
  return max > 0 ? max : geometry.armStartRadius;
}

/**
 * Floor on the radial tilt, and so a ceiling of 1/this on how much flux one
 * sprite can be handed relative to an outer one. The tilt suppresses inner
 * placements and the flux weight divides the same factor back out, which is
 * exact in EXPECTATION but unbounded in variance: at bias 3 an inner sprite
 * survives with probability ~0.007 and would then carry ~138x an outer
 * sprite's flux, so one unlucky complex took a third of the tier's light and
 * read as a bright knot inside the bulge — the opposite of the knob's point.
 *
 * Applied to BOTH sides, so the cancellation stays exact; what it costs is
 * that the tilt saturates in the inner arm at high bias rather than
 * continuing to bite.
 */
const TILT_FLOOR = 0.05;

/** The radial tilt at a radius — ONE definition, read by the placement acceptance and the flux weight that cancels it, so the two cannot drift apart. */
function radialTilt(radius: number, referenceRadius: number, bias: number): number {
  if (bias <= 0) return 1;
  return Math.max(TILT_FLOOR, (Math.max(radius, 0) / referenceRadius) ** bias);
}

export function buildArmParticleCloud(
  geometry: GalaxyDescription,
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
  const bias = Math.max(0, tuning.arms.cloud.radialBias);
  const rTilt = tiltReferenceRadius(geometry);

  const particles: CloudParticle[] = buildClusteredDiscPlacement<{ radius: number }>(
    {
      geometry,
      rng,
      count,
      clumpiness: tuning.arms.cloud.clumpiness,
      complexSpread,
      elongation: tuning.arms.cloud.elongation,
      sigmaZComplex,
      discSigmaR: (k) => DISC_SIGMA_RATIOS[k]! * hLight,
      discWeights: DISC_SURFACE_WEIGHTS,
      discWeightSum,
      // This tier has no SF-map placement mode of its own — it stays on the
      // analytic arm-lane path unconditionally (`armBias: 1` — this tier IS
      // the arm feature, the smooth-disc fallback only fires when an arm has
      // no valid span).
      placement: {
        kind: 'analytic',
        armBias: 1,
        laneFrameAt: (arm, logR) => armRidgeFrameAt(logR, geometry, arm),
        laneAcceptance: (arm, radius) =>
          armFadeEnvelope(radius, geometry, arm) * radialTilt(radius, rTilt, bias),
        crossLaneSigma: (radius) => armCrossSigma(radius, geometry, tuning),
      },
    },
    (childRng, center) => {
      // The along-arm brightness shading is carried by the SAMPLING density
      // (`laneAcceptance`'s fade envelope), not by per-particle flux, so the
      // tier reads as smoothly graded rather than clumped on top of its own
      // clustering. The radial tilt is the one part of that density that
      // ISN'T brightness, which is why the flux weight below cancels it.
      const radiusAtParticle = Math.hypot(center[0], center[2]);
      const sizeFrac = SIZE_MIN_RATIO + childRng() * (SIZE_MAX_RATIO - SIZE_MIN_RATIO);
      const radius =
        armCrossSigma(radiusAtParticle, geometry, tuning) * sizeFrac * tuning.arms.cloud.sizeScale;
      return { radius };
    },
  );

  // Per-particle flux weight. The R^2 term holds SURFACE brightness constant
  // across the size draw (flux/R^2 fixed, so amplitude ~ 1/R) — a big sprite
  // is a wider cloud, not a brighter one, which is what stops the size draw
  // from reading as a brightness lottery.
  //
  // Dividing by `radialTilt` cancels exactly the factor `laneAcceptance`
  // multiplied into the placement density, so the tier's radial LIGHT
  // profile is whatever it was at bias 0 however far the tilt pushes the
  // sprites. Without it the tilt would drag the arm's light outward with its
  // grain: the outer arm would gain both more sprites AND each of them
  // brighter, which is the failure the knob exists to avoid.
  //
  // `armExcessSurfaceShape` is what sets that profile, and is the SAME
  // function the ridge chain's `lambda` uses. Without it this tier had no
  // radial law at all: the placement density's fade/width terms cancelled to
  // near-flat surface brightness along the arm, so the cloud kept shining
  // where the ridge had already faded and `cloud.share` moved the arms'
  // light outward instead of just re-graining it.
  const shape = (p: CloudParticle): number =>
    armExcessSurfaceShape(
      Math.hypot(p.center[0], p.center[2]),
      geometry,
      hLight,
      tuning.arms.excessScaleRatio,
    );
  const weights = particles.map(
    (p) =>
      (p.radius * p.radius * shape(p)) /
      radialTilt(Math.hypot(p.center[0], p.center[2]), rTilt, bias),
  );
  let weightSum = 0;
  for (const w of weights) weightSum += w;
  if (!(weightSum > 0)) return [];
  const fluxPerWeight = totalFlux / weightSum;

  return particles.map((p, i) => {
    const sigmas = {
      along: p.radius * tuning.arms.cloud.elongation,
      across: p.radius,
      pole: p.radius * SPRITE_POLE_RATIO,
    };
    const flux = fluxPerWeight * weights[i]!;
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
