/**
 * Additive-emission twin of the dust particle cloud (`dustParticleCloud.ts`):
 * stochastic Gaussian sprites scattered along each arm's ridge via the same
 * two-level complex/children sampler (`clusteredDiscPlacement.ts`). Sprite
 * size tracks the local arm cross-section (`armCrossSigma`), not an
 * absolute parsec span, so it flares with radius the same way arm width
 * does (`GalaxyArmTuning.widthScale`). `totalFlux` is this tier's share of
 * `pushArmRidges`' `armExcessFlux`, already split out by the caller.
 */
import {
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
import { distance3 } from '../../../../utils/math/distance3';
import { mulberry32 } from '../../../../utils/random/mulberry32';
import type { GalaxyFieldComponent } from '../../../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { Vec3 } from '../../../../@types/math/Vec3';

/**
 * Component-budget ceiling. `galaxyFieldMixture.ts` reserves exactly this
 * many slots (`pushArmRidges`' `reservedComponents`) before sizing the ridge
 * chain, so a huge derived count (`deriveArmCloudCount`) clamps here rather
 * than overflowing `GALAXY_FIELD_MAX_COMPONENTS`. Sized so the coverage
 * slider leads and this stays a backstop — at 400 the Milky Way preset
 * saturated around coverage 2.7, reading as a dead slider rather than a
 * budget hit.
 */
export const ARM_CLOUD_MAX_COUNT = 2000;

/** Sprite radius as a fraction of the local `armCrossSigma`, drawn uniform (see module docblock for why a ratio, not an absolute span). */
const SIZE_MIN_RATIO = 0.35;
const SIZE_MAX_RATIO = 1.0;

/** E[U(SIZE_MIN_RATIO, SIZE_MAX_RATIO)^2] = (a^2+ab+b^2)/3 — the size draw's mean square, feeding `deriveArmCloudCount`'s footprint below. */
const MEAN_SIZE_FRAC_SQ =
  (SIZE_MIN_RATIO ** 2 + SIZE_MIN_RATIO * SIZE_MAX_RATIO + SIZE_MAX_RATIO ** 2) / 3;

/** Ridge samples for the coverage integral below — arc length and local width are both smooth in log-radius, so a coarse sample suffices. */
const ARM_COVERAGE_SAMPLES = 48;

/** Complex-level vertical scatter, a fraction of the disc's own height — matches `pushArmRidges`' calibrated arm-population thickness (its own `sigmas.pole = diskHeight * 0.8`). */
export const COMPLEX_HEIGHT_RATIO = 0.8;

/** Each sprite is flattened relative to its OWN in-plane extent — same ratio `dustParticleCloud.ts`'s `CLOUD_POLE_RATIO` uses for the analogous GMC-complex shape. */
const SPRITE_POLE_RATIO = 0.6;

/** One complex's child scatter, as a fraction of the LOCAL arm width at a representative radius — mirrors the size draw's own reasoning: arm width sets every other length scale here, not an absolute pc span. */
export const COMPLEX_SPREAD_RATIO = 0.6;

const TAU_ROOT3 = (2 * Math.PI) ** 1.5;

/**
 * The covering-factor integral behind `GalaxyArmCloudTuning.coverage` — the
 * same f = N * <sprite footprint> / area argument `dustParticleCloud.ts`
 * documents for the dust tier.
 *
 * Per arc-length element ds at radius r the strip area is `2 *
 * armCrossSigma(r) * ds`, fade-weighted so a faded outer arm doesn't demand
 * sprites nothing will see; a sprite there has mean footprint `PI *
 * elongation * armCrossSigma(r)^2 * sizeScale^2 * MEAN_SIZE_FRAC_SQ`.
 * Dividing cancels one power of armCrossSigma(r), evaluated by trapezoid
 * over a log-radius ridge sample and summed across arms.
 *
 * `cloud.radialBias` is deliberately absent: it moves sprites without
 * resizing the arm, so demand is unchanged.
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
    const logStart = arm.spanStartLogR;
    const rStart = geometry.armStartRadius * Math.exp(logStart);
    const rEnd = arm.fadeRadius;
    if (rEnd <= rStart) continue;
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
 * Reference radius for the radial tilt: the outermost arm's own fade
 * radius, so `(radius / this) ** bias` never exceeds 1 anywhere a complex
 * can be proposed — a weight above 1 would silently flatten the sampler's
 * rejection test into a uniform tail instead of erroring.
 *
 * One reference across all arms, not each arm's own fadeRadius, so the tilt
 * can't redistribute light between arms of different lengths.
 */
export function tiltReferenceRadius(geometry: GalaxyDescription): number {
  let max = 0;
  for (const arm of geometry.arms) max = Math.max(max, arm.fadeRadius);
  return max > 0 ? max : geometry.armStartRadius;
}

/**
 * Floor on the radial tilt, and so a ceiling of 1/this on how much flux one
 * sprite can be handed relative to an outer one. The tilt suppresses inner
 * placements and the flux weight divides the same factor back out — exact
 * in expectation but unbounded in variance: at bias 3 an inner sprite
 * survives with probability ~0.007 and would then carry ~138x an outer
 * sprite's flux, reading as a bright knot inside the bulge. Applied to both
 * sides so the cancellation stays exact.
 */
const TILT_FLOOR = 0.05;

/** The radial tilt at a radius — ONE definition, read by the placement acceptance and the flux weight that cancels it, so the two cannot drift apart. */
export function radialTilt(radius: number, referenceRadius: number, bias: number): number {
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

  const hLight = discLightScaleLength(geometry);
  // A representative radius for the complex-level clustering scale below —
  // per-particle size still reads the true local armCrossSigma at that
  // particle's own radius; this only sets how tightly children huddle
  // around their complex, treated as roughly constant along an arm.
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
      // This tier has no ISM-map placement mode — it stays on the analytic
      // arm-lane path unconditionally (`armBias: 1`; the smooth-disc
      // fallback only fires when an arm has no valid span).
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
      // Along-arm brightness shading is carried by the sampling density
      // (`laneAcceptance`'s fade envelope), not per-particle flux, so the
      // tier reads as smoothly graded. The radial tilt is the one part of
      // that density that isn't brightness — the flux weight below cancels it.
      const radiusAtParticle = Math.hypot(center[0], center[2]);
      const sizeFrac = SIZE_MIN_RATIO + childRng() * (SIZE_MAX_RATIO - SIZE_MIN_RATIO);
      const radius =
        armCrossSigma(radiusAtParticle, geometry, tuning) * sizeFrac * tuning.arms.cloud.sizeScale;
      return { radius };
    },
  );

  // Per-particle flux weight. The R^2 term holds surface brightness constant
  // across the size draw (flux/R^2 fixed, so amplitude ~ 1/R) — a big sprite
  // is a wider cloud, not a brighter one. Dividing by `radialTilt` cancels
  // the factor `laneAcceptance` multiplied into the placement density;
  // `armExcessSurfaceShape` — the same function the ridge chain's `lambda`
  // uses — is what leaves a radial law behind once that cancels.
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
    // Per-particle radial cross-fade, matching the ridge chain's — this tier
    // renders alongside those blobs and would otherwise sit at one flat hue
    // while neighbours grade bulge-warm to disc-blue.
    const particleRadius = Math.hypot(p.center[0], p.center[2]);
    const color = armColor(geometry.youngFraction, particleRadius / geometry.outerRadius);
    return {
      amplitude,
      ...inverseCovarianceFromFrame(p.frame, sigmas),
      color,
      center: p.center,
      boundRadius: Math.max(sigmas.along, sigmas.across, sigmas.pole),
    };
  });
}
