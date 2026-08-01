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
import { buildClusteredDiscPlacement, type CloudFrame } from './clusteredDiscPlacement';
import {
  armColor,
  armCrossSigma,
  armRidgeFrameAt,
  DISC_SIGMA_RATIOS,
  DISC_SURFACE_WEIGHTS,
} from './galaxyFieldMixture';
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
 * before sizing the ridge chain, so cranking `armCloudCount` shrinks the
 * ridge chain's own budget rather than overflowing `GALAXY_FIELD_MAX_COMPONENTS`.
 */
export const ARM_CLOUD_MAX_COUNT = 400;

/** Sprite radius as a fraction of the LOCAL `armCrossSigma`, drawn uniform — see this module's docblock for why this is a ratio and not an absolute span. */
const SIZE_MIN_RATIO = 0.35;
const SIZE_MAX_RATIO = 1.0;

/** Complex-level vertical scatter, a fraction of the disc's own height — matches `pushArmRidges`' calibrated arm-population thickness (its own `sigmas.pole = diskHeight * 0.8`). */
const COMPLEX_HEIGHT_RATIO = 0.8;

/** Each sprite is flattened relative to its OWN in-plane extent — same ratio `dustParticleCloud.ts`'s `CLOUD_POLE_RATIO` uses for the analogous GMC-complex shape. */
const SPRITE_POLE_RATIO = 0.6;

/** One complex's child scatter, as a fraction of the LOCAL arm width at a representative radius — mirrors the size draw's own reasoning: arm width sets every other length scale here, not an absolute pc span. */
const COMPLEX_SPREAD_RATIO = 0.6;

const TAU_ROOT3 = (2 * Math.PI) ** 1.5;

type CloudParticle = { center: Vec3; readonly frame: CloudFrame; readonly radius: number };

export function buildArmParticleCloud(
  geometry: GalaxyFieldGeometry,
  tuning: GalaxyFieldTuning,
  totalFlux: number,
  seed: number,
): readonly GalaxyFieldComponent[] {
  if (geometry.numArms <= 0 || totalFlux <= 0 || tuning.armCloudCount <= 0) return [];
  const count = Math.min(Math.max(0, Math.round(tuning.armCloudCount)), ARM_CLOUD_MAX_COUNT);
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
