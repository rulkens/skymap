/**
 * buildClusteredDiscPlacement — the two-level complex/children scatter
 * shared by every stochastic particle tier on the analytic field (dust GMCs
 * today, arm emission sprites next): pick a weighted arm lane or fall back
 * to the smooth disc profile, seed one "complex" there, then scatter its
 * children around it. Extracted out of `dustParticleCloud.ts` so a second
 * tier doesn't restate this sampler — the two axes consumers genuinely
 * differ on (the lane FRAME they place onto, and the cross-lane spread) are
 * callbacks; everything else is a plain config value.
 *
 * Per-child payload (a size draw, in both current consumers) is drawn via
 * `drawPayload`, called INLINE in the placement loop rather than in a
 * separate pass over the result: the rng draw ORDER is load-bearing (same
 * seed must keep producing the same cloud), and a separate payload pass
 * would interleave differently against the next complex's own draws.
 *
 * PURITY INVARIANT: pure given its `rng`, no Math.random/Date/engine state.
 */
import { armAgeWeight } from './dustLaneFeatures';
import { warpSurfaceFrame } from '../../utils/galaxy/warpSurfaceFrame';
import { gaussian } from '../../utils/random/gaussian';
import type { GalaxyFieldArmRecord } from '../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';
import type { Vec3 } from '../../@types/math/Vec3';

/** Bounded rejection sampling against `armFadeEnvelope` when seeding a complex on an arm lane. */
const ARM_FADE_REJECTION_TRIES = 24;

/** Complex children are flattened relative to their in-plane extent — a fixed clustering-shape constant shared by every consumer, not exposed as a knob. */
const CHILD_POLE_RATIO = 0.4;

export type CloudFrame = { readonly along: Vec3; readonly across: Vec3; readonly pole: Vec3 };

/** A lane/ridge frame at one arm log-radius, offset already applied by the caller (dust offsets onto its lane; the arm cloud passes the ridge itself, offset 0). */
export type LaneFrame = { readonly point: Vec3 } & CloudFrame;

export type ClusteredDiscPlacementConfig = {
  readonly geometry: GalaxyFieldGeometry;
  readonly rng: () => number;
  /** Total particle count across every complex. */
  readonly count: number;
  /** 0..1 probability a complex seeds on an arm lane rather than the smooth disc. */
  readonly armBias: number;
  /** 0..1 hierarchical clustering: 0 = every particle its own complex, 1 = ~16 children per complex. */
  readonly clumpiness: number;
  /** One-sigma child scatter around its complex centre, before `elongation`. */
  readonly complexSpread: number;
  /** sigma_along / sigma_across for the child scatter. */
  readonly elongation: number;
  /** Complex-level vertical (pole-axis) one-sigma scatter. */
  readonly sigmaZComplex: number;
  /** The lane/ridge frame at one arm's log-radius, or null when this draw has no valid point there (falls back to the smooth disc). */
  readonly laneFrameAt: (arm: GalaxyFieldArmRecord, logR: number) => LaneFrame | null;
  /**
   * Rejection-sampling acceptance for a complex proposed at this radius on
   * this arm, in [0,1] — the along-arm placement density, up to a constant.
   * MUST NOT exceed 1: rejection sampling silently flattens the excess into
   * a uniform tail rather than erroring.
   *
   * A callback rather than the fade envelope it usually is, because a
   * consumer may want to weight WHERE its particles land differently from
   * how bright the arm is there (`armParticleCloud.ts` tilts its sprites
   * outward and cancels the tilt in flux). Dust passes the bare envelope.
   */
  readonly laneAcceptance: (arm: GalaxyFieldArmRecord, radius: number) => number;
  /** Cross-lane (across-arm) one-sigma spread at a radius — already whatever fraction of the arm's own width the caller wants. */
  readonly crossLaneSigma: (radius: number) => number;
  /** Smooth-disc fallback: component k's radial sigma. */
  readonly discSigmaR: (k: number) => number;
  /** Smooth-disc fallback: DISC_SURFACE_WEIGHTS-shaped weights to pick k with, and their sum. */
  readonly discWeights: readonly number[];
  readonly discWeightSum: number;
};

export type PlacedParticle<TPayload> = { center: Vec3; readonly frame: CloudFrame } & TPayload;

function pickWeighted(rng: () => number, weights: readonly number[], sum: number): number {
  const r = rng() * sum;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]!;
    if (r <= acc) return i;
  }
  return weights.length - 1;
}

/**
 * Places `config.count` particles across complexes of
 * `1 + 15*clumpiness` children each, every complex either arm-lane- or
 * smooth-disc-seeded. `drawPayload` runs once per child, immediately after
 * its centre/frame are fixed, so a consumer's own per-particle randomness
 * lands in the same rng draw slot the sampler has always used it at.
 */
export function buildClusteredDiscPlacement<TPayload>(
  config: ClusteredDiscPlacementConfig,
  drawPayload: (rng: () => number, center: Vec3, frame: CloudFrame) => TPayload,
): PlacedParticle<TPayload>[] {
  const { geometry, rng, count, armBias, clumpiness, complexSpread, elongation, sigmaZComplex } =
    config;
  const childrenPerComplex = Math.max(1, Math.round(1 + 15 * clumpiness));
  const canUseArms = geometry.numArms > 0;
  const armWeights = geometry.arms.map((arm) => armAgeWeight(arm));
  const armWeightSum = armWeights.reduce((s, w) => s + w, 0);

  /** A complex seeded on an arm's lane, or null if this arm has no valid span (falls back to the smooth disc). */
  function placeArmLaneComplex(): { center: Vec3; frame: CloudFrame } | null {
    const armIndex = pickWeighted(rng, armWeights, armWeightSum);
    const arm = geometry.arms[armIndex]!;
    const logMin = Math.log(1.05);
    const logMax = Math.log(arm.fadeRadius / geometry.armStartRadius);
    if (!(logMax > logMin)) return null;

    let logR = logMin;
    let radius = geometry.armStartRadius;
    for (let tries = 0; tries < ARM_FADE_REJECTION_TRIES; tries++) {
      logR = logMin + rng() * (logMax - logMin);
      radius = geometry.armStartRadius * Math.exp(logR);
      if (rng() < config.laneAcceptance(arm, radius)) break;
    }

    const frame = config.laneFrameAt(arm, logR);
    if (!frame) return null;
    const laneSpread = config.crossLaneSigma(radius);
    // ONE scalar offset per axis, shared across x/y/z — not redrawn per component.
    const acrossOffset = gaussian(rng) * laneSpread;
    const poleOffset = gaussian(rng) * sigmaZComplex;
    const center: Vec3 = [
      frame.point[0] + frame.across[0] * acrossOffset + frame.pole[0] * poleOffset,
      frame.point[1] + frame.across[1] * acrossOffset + frame.pole[1] * poleOffset,
      frame.point[2] + frame.across[2] * acrossOffset + frame.pole[2] * poleOffset,
    ];
    return { center, frame: { along: frame.along, across: frame.across, pole: frame.pole } };
  }

  function placeSmoothDiscComplex(): { center: Vec3; frame: CloudFrame } {
    const k = pickWeighted(rng, config.discWeights, config.discWeightSum);
    const sigmaR = config.discSigmaR(k);
    const x = gaussian(rng) * sigmaR;
    const z = gaussian(rng) * sigmaR;
    const y = gaussian(rng) * sigmaZComplex;
    const radius = Math.hypot(x, z);
    const frame = warpSurfaceFrame(radius, Math.atan2(z, x), geometry);
    return { center: [x, y, z], frame };
  }

  const particles: PlacedParticle<TPayload>[] = [];
  let placed = 0;
  while (placed < count) {
    const childCount = Math.min(childrenPerComplex, count - placed);
    // Arm bias re-rolled per complex, not per particle — a complex (and its
    // children) is the hierarchical unit real GMC/OB associations form at.
    const armRoll = rng();
    const placement =
      (canUseArms && armRoll < armBias ? placeArmLaneComplex() : null) ?? placeSmoothDiscComplex();

    for (let c = 0; c < childCount; c++) {
      const along = gaussian(rng) * complexSpread * elongation;
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
      const payload = drawPayload(rng, center, placement.frame);
      particles.push({ center, frame: placement.frame, ...payload });
    }
    placed += childCount;
  }

  return particles;
}
