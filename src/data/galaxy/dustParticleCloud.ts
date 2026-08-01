/**
 * buildDustParticleCloud — small anisotropic 3D Gaussians standing in for
 * GMC/cloud complexes, appended to the mixture `dustMap.wesl` splats. Three
 * anchors: Larson's third law (mass ~ R^2 at ~constant cloud surface
 * density, so every cloud peaks at roughly the same tau — sharp, separated
 * clouds, not a haze); the R^-2.2 GMC size function (Watkins+2023); ISM
 * hierarchical clustering, as a two-level complex/children placement. Bubble
 * carving (4d) reuses `dustBubblePlacements.ts` so a cavity there is one here.
 *
 * PURITY INVARIANT: pure `(geometry, dust, seed) -> flat data`, no
 * Math.random/Date/engine state — a Worker/compute-pass candidate.
 */
import { buildDustBubblePlacements, pcToUnits } from './dustBubblePlacements';
import { armAgeWeight, armOffsetFrameAt } from './dustLaneFeatures';
import { clampedDustCloudShare, dustDiscShape, dustSigmaR } from './galaxyDustMixture';
import {
  armCrossSigma,
  armFadeEnvelope,
  DISC_SIGMA_RATIOS,
  DISC_SURFACE_WEIGHTS,
} from './galaxyFieldMixture';
import { dustExtinctionRgb } from '../../utils/galaxy/dustExtinctionRgb';
import { inverseCovarianceFromFrame } from '../../utils/galaxy/inverseCovarianceFromFrame';
import { warpSurfaceFrame } from '../../utils/galaxy/warpSurfaceFrame';
import { gaussian } from '../../utils/random/gaussian';
import { mulberry32 } from '../../utils/random/mulberry32';
import type { GalaxyDustParams } from '../../@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldComponent } from '../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';
import type { GalaxyFieldTuning } from '../../@types/galaxy/GalaxyFieldTuning';
import type { Vec3 } from '../../@types/math/Vec3';

const MAX_PARTICLE_COUNT = 40000;

/**
 * GMC size function dN/dR ~ R^-2.2, over the measured 15-200 pc span. ABSOLUTE
 * parsecs, not a fraction of the disc: cloud sizes are set by the ISM's own
 * Jeans/turbulence physics and are near-universal across galaxies, so a dwarf
 * gets the same clouds as a giant, just fewer of them.
 *
 * These bound the whole tier's CONTRAST, which is why they are calibration and
 * not taste. Per-cloud peak tau = (the cloud tier's tau share) / f, with the
 * covering factor f = N * 2*PI * elongation * <R^2> / A_disc. Oversized clouds
 * drive f into the tens, every cloud fades to invisibility to keep the total
 * honest, and the tier reads as a smooth haze — the failure this replaces.
 * f around 2-3 is the target: dark enough per cloud to see, overlapping enough
 * along the arms to mottle rather than dot.
 */
const SIZE_MIN_PC = 15;
const SIZE_MAX_PC = 200;
const GMC_SIZE_POWER = 2.2;

/** GMC associations run 300-800 pc (the same scale as the measured spur spacing); this is the child scatter's one-sigma, before elongation. */
const COMPLEX_SPREAD_PC = 250;

/** Clouds are flattened relative to their in-plane extent. */
const CLOUD_POLE_RATIO = 0.6;
const CHILD_POLE_RATIO = 0.4;

/** Bounded rejection sampling against `armFadeEnvelope` when seeding a complex on the arm lane. */
const ARM_FADE_REJECTION_TRIES = 24;
/** A cavity's swept rim lands just past its edge, not exactly on it. */
const RIM_OVERSHOOT = 0.15;
/** Below this a particle-to-bubble-centre vector is too degenerate to normalise; fall back to a random direction. */
const CARVE_EPSILON = 1e-6;

const TAU_ROOT3 = (2 * Math.PI) ** 1.5;
/** `armCrossSigma`/`armOffsetFrameAt` only read `.armWidthScale`; this builder has no field tuning of its own to hand them. */
const ARM_WIDTH_TUNING = { armWidthScale: 1 } as GalaxyFieldTuning;

type CloudFrame = { readonly along: Vec3; readonly across: Vec3; readonly pole: Vec3 };

type CloudParticle = {
  center: Vec3;
  readonly frame: CloudFrame;
  readonly radius: number;
};

function randomDirection(rng: () => number): Vec3 {
  const v: Vec3 = [gaussian(rng), gaussian(rng), gaussian(rng)];
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function buildDustParticleCloud(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  seed: number,
): readonly GalaxyFieldComponent[] {
  const { cloud } = dust;
  if (geometry.discFraction <= 0 || dust.tau <= 0 || cloud.count <= 0 || cloud.share <= 0) {
    return [];
  }
  const count = Math.min(cloud.count, MAX_PARTICLE_COUNT);

  const sizeMin = pcToUnits(SIZE_MIN_PC) * cloud.sizeScale;
  const sizeMax = pcToUnits(SIZE_MAX_PC) * cloud.sizeScale;
  if (!(sizeMin > 0) || !(sizeMax > sizeMin)) return [];

  // Inverse-CDF of dN/dR ~ R^-a over [sizeMin, sizeMax].
  const sizeExp = 1 - GMC_SIZE_POWER;
  const sizeMinPow = sizeMin ** sizeExp;
  const sizeMaxPow = sizeMax ** sizeExp;
  const sampleRadius = (u: number): number =>
    (u * (sizeMaxPow - sizeMinPow) + sizeMinPow) ** (1 / sizeExp);
  const complexSpread = pcToUnits(COMPLEX_SPREAD_PC) * cloud.sizeScale;

  const shape = dustDiscShape(geometry, dust);
  const extinctionRgb = dustExtinctionRgb(dust.rV);
  const sigmaZCloud = shape.sigmaZ * cloud.heightRatio;
  const childrenPerComplex = Math.max(1, Math.round(1 + 15 * cloud.clumpiness));

  const canUseArms = geometry.numArms > 0;
  const armWeights = geometry.arms.map((arm) => armAgeWeight(arm));
  const armWeightSum = armWeights.reduce((s, w) => s + w, 0);

  const rng = mulberry32(seed ^ 0x44555354); // "DUST"

  function pickWeighted(weights: readonly number[], sum: number): number {
    const r = rng() * sum;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i]!;
      if (r <= acc) return i;
    }
    return weights.length - 1;
  }

  /** A complex seeded on an arm's dust lane, or null if this arm has no valid span (falls back to the smooth disc). */
  function placeArmLaneComplex(): { center: Vec3; frame: CloudFrame } | null {
    const armIndex = pickWeighted(armWeights, armWeightSum);
    const arm = geometry.arms[armIndex]!;
    const logMin = Math.log(1.05);
    const logMax = Math.log(arm.fadeRadius / geometry.armStartRadius);
    if (!(logMax > logMin)) return null;

    let logR = logMin;
    let radius = geometry.armStartRadius;
    for (let tries = 0; tries < ARM_FADE_REJECTION_TRIES; tries++) {
      logR = logMin + rng() * (logMax - logMin);
      radius = geometry.armStartRadius * Math.exp(logR);
      if (rng() < armFadeEnvelope(radius, geometry, arm)) break;
    }

    const frame = armOffsetFrameAt(logR, geometry, dust, arm);
    const laneSpread =
      armCrossSigma(radius, geometry, ARM_WIDTH_TUNING) * 0.25 * dust.network.laneWidth;
    // ONE scalar offset per axis, shared across x/y/z — not redrawn per component.
    const acrossOffset = gaussian(rng) * laneSpread;
    const poleOffset = gaussian(rng) * sigmaZCloud;
    const center: Vec3 = [
      frame.point[0] + frame.across[0] * acrossOffset + frame.pole[0] * poleOffset,
      frame.point[1] + frame.across[1] * acrossOffset + frame.pole[1] * poleOffset,
      frame.point[2] + frame.across[2] * acrossOffset + frame.pole[2] * poleOffset,
    ];
    return { center, frame: { along: frame.along, across: frame.across, pole: frame.pole } };
  }

  function placeSmoothDiscComplex(): { center: Vec3; frame: CloudFrame } {
    const k = pickWeighted(DISC_SURFACE_WEIGHTS, shape.sumW);
    const sigmaR = dustSigmaR(k, shape);
    const x = gaussian(rng) * sigmaR;
    const z = gaussian(rng) * sigmaR;
    const y = gaussian(rng) * sigmaZCloud;
    const radius = Math.hypot(x, z);
    const frame = warpSurfaceFrame(radius, Math.atan2(z, x), geometry);
    return { center: [x, y, z], frame };
  }

  const particles: CloudParticle[] = [];
  let placed = 0;
  while (placed < count) {
    const childCount = Math.min(childrenPerComplex, count - placed);
    // Arm bias re-rolled per complex, not per particle — a complex (and its
    // children) is the hierarchical unit real GMC associations form at.
    const armRoll = rng();
    const placement =
      (canUseArms && armRoll < cloud.armBias ? placeArmLaneComplex() : null) ??
      placeSmoothDiscComplex();

    for (let c = 0; c < childCount; c++) {
      const along = gaussian(rng) * complexSpread * cloud.elongation;
      const across = gaussian(rng) * complexSpread;
      const pole = gaussian(rng) * complexSpread * CHILD_POLE_RATIO;
      const center: Vec3 = [
        placement.center[0] +
          placement.frame.along[0] * along +
          placement.frame.across[0] * across +
          placement.frame.pole[0] * pole,
        placement.center[1] +
          placement.frame.along[1] * along +
          placement.frame.across[1] * across +
          placement.frame.pole[1] * pole,
        placement.center[2] +
          placement.frame.along[2] * along +
          placement.frame.across[2] * across +
          placement.frame.pole[2] * pole,
      ];
      particles.push({ center, frame: placement.frame, radius: sampleRadius(rng()) });
    }
    placed += childCount;
  }

  // ---- 4d: bubble carving — swept-up shells, not just holes -----------------
  const bubbles = buildDustBubblePlacements(geometry, dust, seed);
  if (bubbles.length > 0) {
    for (const particle of particles) {
      for (const bubble of bubbles) {
        const dx = particle.center[0] - bubble.center[0];
        const dy = particle.center[1] - bubble.center[1];
        const dz = particle.center[2] - bubble.center[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= bubble.radius * bubble.radius) continue;
        if (rng() >= cloud.bubbleCarve) break;
        const d = Math.sqrt(d2);
        const dir: Vec3 = d > CARVE_EPSILON ? [dx / d, dy / d, dz / d] : randomDirection(rng);
        const p = bubble.radius * (1 + RIM_OVERSHOOT * rng());
        particle.center = [
          bubble.center[0] + dir[0] * p,
          bubble.center[1] + dir[1] * p,
          bubble.center[2] + dir[2] * p,
        ];
        break; // one carve per particle — bubbles rarely overlap
      }
    }
  }

  // ---- 4b: Larson's third law — mass ~ R^2 (constant cloud surface density) -
  let weightedSigma2 = 0;
  for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
    weightedSigma2 += (DISC_SURFACE_WEIGHTS[i]! / shape.sumW) * dustSigmaR(i, shape) ** 2;
  }
  const totalMass = clampedDustCloudShare(dust) * dust.tau * 2 * Math.PI * weightedSigma2;
  let sumR2 = 0;
  for (const p of particles) sumR2 += p.radius * p.radius;
  if (!(totalMass > 0) || !(sumR2 > 0)) return [];
  const massPerR2 = totalMass / sumR2;

  return particles.map((p) => {
    const sigmas = {
      along: p.radius * cloud.elongation,
      across: p.radius,
      pole: p.radius * CLOUD_POLE_RATIO,
    };
    const mass = massPerR2 * p.radius * p.radius;
    const amplitude = mass / (TAU_ROOT3 * sigmas.along * sigmas.across * sigmas.pole);
    return {
      amplitude,
      ...inverseCovarianceFromFrame(p.frame, sigmas),
      // Extinction RATIOS, not an emission tint — see `dustExtinctionRgb`.
      color: extinctionRgb,
      center: p.center,
      boundRadius: Math.max(sigmas.along, sigmas.across, sigmas.pole),
    };
  });
}
