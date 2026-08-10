/**
 * Sprite placement for interarm spurs (`armSpurGeometry.ts`'s
 * `deriveArmSpurs`), mirroring `armParticleCloud.ts`'s arm-lane placement
 * but keyed to each spur's own curve. Not routed through
 * `buildClusteredDiscPlacement`: that sampler hardcodes `ARM_SPAN_START_FRAC`
 * as its rejection floor, which a spur breaks — its span starts at its own
 * root (`GalaxyFieldArmRecord.spanStartLogR`), which can sit anywhere in the
 * disc. `totalFlux` is this tier's share of `pushArmRidges`' `armExcessFlux`,
 * split from `galaxyFieldMixture.ts`. Pure function, no engine state.
 */
import {
  armColor,
  armCrossSigma,
  armExcessSurfaceShape,
  armFadeEnvelope,
  armRidgeCurvePoint,
  armRidgeFrameAt,
} from './armRidgeGeometry';
import { pickWeighted } from './clusteredDiscPlacement';
import { discLightScaleLength } from '../../../../utils/galaxy/discLightScaleLength';
import { inverseCovarianceFromFrame } from '../../../../utils/galaxy/inverseCovarianceFromFrame';
import { gaussian } from '../../../../utils/random/gaussian';
import { mulberry32 } from '../../../../utils/random/mulberry32';
import type { GalaxyFieldComponent } from '../../../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { Vec3 } from '../../../../@types/math/Vec3';

/** Rejection-sampling floor when seeding a sprite on a spur's own fade envelope — the `ARM_FADE_REJECTION_TRIES` precedent in `clusteredDiscPlacement.ts`. */
const SPUR_FADE_REJECTION_TRIES = 24;

/** Coarser than `armParticleCloud.ts`'s `ARM_COVERAGE_SAMPLES` (48): a spur's own span is a small fraction of a full arm's, smooth over its own steeper pitch too, so fewer samples already bound the arc-length integral tightly. */
const SPUR_COVERAGE_SAMPLES = 12;

/**
 * Fixed nominal covering factor. Unlike the arm cloud, spurs carry no
 * `coverage` slider of their own — `sizeScale` and `elongation` (this tier's
 * only density levers) already move the covering fraction inversely, and a
 * feature meant to read as a handful of short feathers doesn't need a second
 * knob for "how many". Calibrated so a mid-disc spur under the shipped
 * defaults reads as a few-sprite feather, not a re-run of the arm cloud.
 */
const SPUR_COVERAGE = 1.1;

/** Per-galaxy ceiling, well under `ARM_CLOUD_MAX_COUNT` (2000): spurs are the accent tier, not a second arm cloud. */
export const SPUR_CLOUD_MAX_COUNT = 400;

/** Sprite radius as a fraction of the LOCAL `armCrossSigma` — same draw range `armParticleCloud.ts` uses. */
const SIZE_MIN_RATIO = 0.35;
const SIZE_MAX_RATIO = 1.0;
const MEAN_SIZE_FRAC_SQ =
  (SIZE_MIN_RATIO ** 2 + SIZE_MIN_RATIO * SIZE_MAX_RATIO + SIZE_MAX_RATIO ** 2) / 3;

/** Complex-less scatter around the spur curve — a spur has no clustering hierarchy, so these stand in for `armParticleCloud.ts`'s `COMPLEX_SPREAD_RATIO`/`COMPLEX_HEIGHT_RATIO` directly on each sprite. */
const CROSS_OFFSET_RATIO = 0.6;
const POLE_OFFSET_RATIO = 0.8;

/** Each sprite flattened relative to its own in-plane extent — the `armParticleCloud.ts` `SPRITE_POLE_RATIO` precedent. */
const SPRITE_POLE_RATIO = 0.6;

const TAU_ROOT3 = (2 * Math.PI) ** 1.5;

/** "SPRC" — distinct from `armSpurGeometry.ts`'s own "SPUR" salt (`buildArmSpurs`) and `armParticleCloud.ts`'s "ARMC", so all three streams stay independent even when seeded off the same `geometry.seed`. */
const SPUR_CLOUD_SEED_SALT = 0x53505243;

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** This spur's own arc-length x inverse-width integral — the same trapezoid `deriveArmCloudCount` runs over a whole arm, scoped to one spur's short span. Shared by the count derivation and the build's own per-spur pick weights, so the two can never disagree about which spurs get more sprites. */
function spurFootprintIntegral(
  spur: GalaxyFieldArmRecord,
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): number {
  const logStart = spur.spanStartLogR;
  const logEnd = Math.log(spur.fadeRadius / geometry.armStartRadius);
  if (logEnd <= logStart) return 0;
  const duSample = (logEnd - logStart) / (SPUR_COVERAGE_SAMPLES - 1);
  let prevPoint = armRidgeCurvePoint(logStart, geometry, spur);
  let prevIntegrand =
    armFadeEnvelope(geometry.armStartRadius * Math.exp(logStart), geometry, spur) /
    armCrossSigma(geometry.armStartRadius * Math.exp(logStart), geometry, tuning);
  let integral = 0;
  for (let i = 1; i < SPUR_COVERAGE_SAMPLES; i++) {
    const logR = logStart + duSample * i;
    const radius = geometry.armStartRadius * Math.exp(logR);
    const point = armRidgeCurvePoint(logR, geometry, spur);
    const integrand =
      armFadeEnvelope(radius, geometry, spur) / armCrossSigma(radius, geometry, tuning);
    integral += 0.5 * (prevIntegrand + integrand) * distance3(prevPoint, point);
    prevPoint = point;
    prevIntegrand = integrand;
  }
  return integral;
}

/**
 * Component-budget count this tier will spend, summed across every spur —
 * `buildGalaxyFieldMixture` reserves exactly this many slots before sizing
 * the ridge chain, the `deriveArmCloudCount`/`buildArmParticleCloud` pattern.
 */
export function deriveArmSpurCloudCount(
  spurArms: readonly GalaxyFieldArmRecord[],
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): number {
  const spurTuning = tuning.arms.spurs;
  if (spurArms.length === 0 || spurTuning.elongation <= 0 || spurTuning.sizeScale <= 0) return 0;
  const footprintFactor =
    Math.PI * spurTuning.elongation * spurTuning.sizeScale ** 2 * MEAN_SIZE_FRAC_SQ;
  let total = 0;
  for (const spur of spurArms) total += 2 * spurFootprintIntegral(spur, geometry, tuning);
  return Math.min(
    SPUR_CLOUD_MAX_COUNT,
    Math.max(0, Math.round((SPUR_COVERAGE * total) / footprintFactor)),
  );
}

type SpurParticle = {
  readonly center: Vec3;
  readonly frame: { readonly along: Vec3; readonly across: Vec3; readonly pole: Vec3 };
  readonly radius: number;
  readonly spurIndex: number;
};

export function buildArmSpurParticleCloud(
  geometry: GalaxyDescription,
  spurArms: readonly GalaxyFieldArmRecord[],
  tuning: GalaxyFieldTuning,
  totalFlux: number,
  seed: number,
): readonly GalaxyFieldComponent[] {
  if (spurArms.length === 0 || totalFlux <= 0) return [];
  const count = deriveArmSpurCloudCount(spurArms, geometry, tuning);
  if (count <= 0) return [];

  const spurTuning = tuning.arms.spurs;
  const hLight = discLightScaleLength(geometry);
  const rng = mulberry32((seed ^ SPUR_CLOUD_SEED_SALT) >>> 0);

  // Same weights the count derivation summed, read per-spur here so a longer
  // or wider spur draws proportionally more of the fixed total rather than
  // every spur getting an equal share regardless of size.
  const weights = spurArms.map((spur) => spurFootprintIntegral(spur, geometry, tuning));
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (!(weightSum > 0)) return [];

  const particles: SpurParticle[] = [];
  for (let i = 0; i < count; i++) {
    const spurIndex = pickWeighted(rng, weights, weightSum);
    const spur = spurArms[spurIndex]!;
    const logStart = spur.spanStartLogR;
    const logEnd = Math.log(spur.fadeRadius / geometry.armStartRadius);

    let logR = logStart;
    let radius = geometry.armStartRadius * Math.exp(logStart);
    for (let tries = 0; tries < SPUR_FADE_REJECTION_TRIES; tries++) {
      logR = logStart + rng() * (logEnd - logStart);
      radius = geometry.armStartRadius * Math.exp(logR);
      if (rng() < armFadeEnvelope(radius, geometry, spur)) break;
    }

    const frame = armRidgeFrameAt(logR, geometry, spur);
    const crossSigma = armCrossSigma(radius, geometry, tuning);
    const acrossOffset = gaussian(rng) * crossSigma * CROSS_OFFSET_RATIO;
    const poleOffset = gaussian(rng) * geometry.diskHeight * POLE_OFFSET_RATIO;
    const center: Vec3 = [
      frame.point[0] + frame.across[0] * acrossOffset + frame.pole[0] * poleOffset,
      frame.point[1] + frame.across[1] * acrossOffset + frame.pole[1] * poleOffset,
      frame.point[2] + frame.across[2] * acrossOffset + frame.pole[2] * poleOffset,
    ];
    const sizeFrac = SIZE_MIN_RATIO + rng() * (SIZE_MAX_RATIO - SIZE_MIN_RATIO);
    const spriteRadius = crossSigma * sizeFrac * spurTuning.sizeScale;
    particles.push({
      center,
      frame: { along: frame.along, across: frame.across, pole: frame.pole },
      radius: spriteRadius,
      spurIndex,
    });
  }

  // Same R^2-holds-surface-brightness-constant weighting `armParticleCloud.ts`
  // uses, minus its radial-tilt cancellation (no tilt knob here — a spur's
  // few sprites don't need one, the root-spacing law already spaces them out).
  const shape = (p: SpurParticle): number =>
    armExcessSurfaceShape(
      Math.hypot(p.center[0], p.center[2]),
      geometry,
      hLight,
      tuning.arms.excessScaleRatio,
    );
  const fluxWeights = particles.map((p) => p.radius * p.radius * shape(p));
  let fluxWeightSum = 0;
  for (const w of fluxWeights) fluxWeightSum += w;
  if (!(fluxWeightSum > 0)) return [];
  const fluxPerWeight = totalFlux / fluxWeightSum;

  return particles.map((p, i) => {
    const sigmas = {
      along: p.radius * spurTuning.elongation,
      across: p.radius,
      pole: p.radius * SPRITE_POLE_RATIO,
    };
    const flux = fluxPerWeight * fluxWeights[i]!;
    const amplitude = flux / (TAU_ROOT3 * sigmas.along * sigmas.across * sigmas.pole);
    const particleRadius = Math.hypot(p.center[0], p.center[2]);
    // `age` (0=young) inverted into `armColor`'s youngFraction (1=young) —
    // spurs are drawn young (`armSpurGeometry.ts`'s SPUR_AGE_FLOOR/JITTER), so
    // this reads bluer than the parent arm regardless of the galaxy's own
    // `youngFraction`, the "young bias" the spur tier is meant to carry.
    const color = armColor(1 - spurArms[p.spurIndex]!.age, particleRadius / geometry.outerRadius);
    return {
      amplitude,
      ...inverseCovarianceFromFrame(p.frame, sigmas),
      color,
      center: p.center,
      boundRadius: Math.max(sigmas.along, sigmas.across, sigmas.pole),
    };
  });
}
