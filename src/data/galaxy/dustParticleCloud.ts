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
import { armCrossSigma } from './armRidgeGeometry';
import { buildClusteredDiscPlacement, type CloudFrame } from './clusteredDiscPlacement';
import { DISC_SIGMA_RATIOS, DISC_SURFACE_WEIGHTS } from './discSurfaceFit';
import { buildDustBubblePlacements, pcToUnits } from './dustBubblePlacements';
import { armOffsetFrameAt } from './dustLaneFeatures';
import { clampedDustCloudShare, dustDiscShape, dustSigmaR } from './galaxyDustMixture';
import { dustExtinctionRgb } from '../../utils/galaxy/dustExtinctionRgb';
import { inverseCovarianceFromFrame } from '../../utils/galaxy/inverseCovarianceFromFrame';
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
 *
 * `SIZE_MIN_PC` doubles as `sizeFloorPc`'s slider default and lower clamp —
 * raising the floor at fixed `count` raises mean R^2, which raises f (mass is
 * renormalised to the tier's total, `massPerR2 = totalMass / sumR2`), which
 * makes every cloud FAINTER even as it grows. Pull `count` down with the
 * floor to hold per-cloud contrast.
 */
export const SIZE_MIN_PC = 15;
const SIZE_MAX_PC = 200;
const GMC_SIZE_POWER = 2.2;

/**
 * Base world span of one full wrap of the baked ridged-noise volume
 * (dustNoiseBake.wesl), parsecs, before `textureScale`. Its four octave
 * bands sit at 500/250/125/62 pc wavelengths — straddling the 15-200 pc
 * measured cloud-size span above, which is the point: the erosion has to
 * bite at the same scale the clouds themselves live at, not far above or
 * below it.
 */
export const DUST_NOISE_TILE_PC = 500;

/**
 * World-unit tile size for the baked noise volume at a given
 * `textureScale` — the one place `pcToUnits` combines with
 * `DUST_NOISE_TILE_PC`, so `createGalaxyEngine.ts` doesn't restate the
 * kpc-per-unit conversion.
 */
export function dustNoiseTileUnits(textureScale: number): number {
  return pcToUnits(DUST_NOISE_TILE_PC) * textureScale;
}

/** GMC associations run 300-800 pc (the same scale as the measured spur spacing); this is the child scatter's one-sigma, before elongation. */
const COMPLEX_SPREAD_PC = 250;

/** Clouds are flattened relative to their in-plane extent. */
const CLOUD_POLE_RATIO = 0.6;

/** A cavity's swept rim lands just past its edge, not exactly on it. */
const RIM_OVERSHOOT = 0.15;
/** Below this a particle-to-bubble-centre vector is too degenerate to normalise; fall back to a random direction. */
const CARVE_EPSILON = 1e-6;

const TAU_ROOT3 = (2 * Math.PI) ** 1.5;
/** `armCrossSigma`/`armOffsetFrameAt` only read `.armWidthScale`; this builder has no field tuning of its own to hand them. */
const ARM_WIDTH_TUNING = { armWidthScale: 1 } as GalaxyFieldTuning;

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

  // Clamped below at SIZE_MIN_PC: under the measured span is unphysical AND
  // makes the speckle this knob exists to fix worse, not better.
  const floorPc = Math.min(Math.max(cloud.sizeFloorPc, SIZE_MIN_PC), SIZE_MAX_PC * 0.9);
  const sizeMin = pcToUnits(floorPc) * cloud.sizeScale;
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

  const rng = mulberry32(seed ^ 0x44555354); // "DUST"

  const particles: CloudParticle[] = buildClusteredDiscPlacement<{ radius: number }>(
    {
      geometry,
      rng,
      count,
      armBias: cloud.armBias,
      clumpiness: cloud.clumpiness,
      complexSpread,
      elongation: cloud.elongation,
      sigmaZComplex: sigmaZCloud,
      laneFrameAt: (arm, logR) => armOffsetFrameAt(logR, geometry, dust, arm),
      crossLaneSigma: (radius) =>
        armCrossSigma(radius, geometry, ARM_WIDTH_TUNING) * 0.25 * dust.network.laneWidth,
      discSigmaR: (k) => dustSigmaR(k, shape),
      discWeights: DISC_SURFACE_WEIGHTS,
      discWeightSum: shape.sumW,
    },
    (childRng) => ({ radius: sampleRadius(childRng()) }),
  );

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
