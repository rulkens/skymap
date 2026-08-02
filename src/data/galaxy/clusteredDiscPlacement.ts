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
import { sampleSfMapOrientation } from '../../utils/galaxy/sampleSfMapOrientation';
import { warpSurfaceFrame } from '../../utils/galaxy/warpSurfaceFrame';
import { gaussian } from '../../utils/random/gaussian';
import type { GalaxyFieldArmRecord } from '../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';
import type { GalaxySfMapOrientation } from '../../@types/galaxy/GalaxySfMapOrientation';
import type { Vec3 } from '../../@types/math/Vec3';

/** Bounded rejection sampling against `armFadeEnvelope` when seeding a complex on an arm lane. */
const ARM_FADE_REJECTION_TRIES = 24;

/** Same idea as `ARM_FADE_REJECTION_TRIES`, own constant: bounded rejection sampling against `mapDensityAt` when it replaces the analytic placement entirely. */
const MAP_DENSITY_REJECTION_TRIES = 24;

/** Complex children are flattened relative to their in-plane extent — a fixed clustering-shape constant shared by every consumer, not exposed as a knob. */
const CHILD_POLE_RATIO = 0.4;

export type CloudFrame = { readonly along: Vec3; readonly across: Vec3; readonly pole: Vec3 };

/** A lane/ridge frame at one arm log-radius, offset already applied by the caller (dust offsets onto its lane; the arm cloud passes the ridge itself, offset 0). */
export type LaneFrame = { readonly point: Vec3 } & CloudFrame;

/**
 * OrientationDeltaStats — an out-param `rotateFrameToOrientation` mutates in
 * place, never reads: the diagnostic tool's engine wants "mean/max |delta|
 * actually applied over the whole build" without either function losing its
 * `(args) -> data` purity by returning a second shape or reaching for
 * module-level state. Caller supplies a fresh `{ count: 0, sumAbsDeltaDeg:
 * 0, maxAbsDeltaDeg: 0 }` and reads it back after the call returns.
 */
export type OrientationDeltaStats = {
  count: number;
  sumAbsDeltaDeg: number;
  maxAbsDeltaDeg: number;
};

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
  /**
   * The SSPSF automaton's measured filament orientation, coherence-weighted
   * so a texel with no measured structure reproduces today's frame exactly —
   * see `rotateFrameToOrientation`. `null` (the default, and every caller's
   * `sfMapDustSeeding`-off path) is a pure no-op: no extra work, no extra
   * `rng` draw, so the gated-off placement stays byte-identical.
   */
  readonly sfMapOrientation?: GalaxySfMapOrientation | null;
  /** Out-param, mutated once per complex whenever `sfMapOrientation` is non-null — see `OrientationDeltaStats`'s own doc. Omitted (the default) does no extra work. */
  readonly orientationDeltaStats?: OrientationDeltaStats;
  /**
   * Normalised [0,1] placement density from the SF map, or null for the
   * analytic path. Non-null REPLACES the arm-lane/smooth-disc roll entirely
   * — every complex is placed by `placeMapDensityComplex`, and `armBias` is
   * not consulted at all (see that function). Required rather than optional
   * so a caller can't forget to gate it: `dustParticleCloud.ts`'s
   * `sfMapDustSeeding`-off path always passes `null` explicitly.
   */
  readonly mapDensityAt: ((radius: number, angle: number) => number) | null;
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

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function recordOrientationDelta(
  stats: OrientationDeltaStats | undefined,
  absDeltaDeg: number,
): void {
  if (!stats) return;
  stats.count++;
  stats.sumAbsDeltaDeg += absDeltaDeg;
  stats.maxAbsDeltaDeg = Math.max(stats.maxAbsDeltaDeg, absDeltaDeg);
}

/**
 * rotateFrameToOrientation — bends a lane/disc frame's in-plane axes
 * (`along`/`across`) toward the SF-map automaton's measured filament
 * orientation, coherence-weighted so a texel with no measured structure
 * (coherence 0) reproduces `frame` exactly. `pole` never moves.
 *
 * The measured angle is relative to the AZIMUTHAL/RADIAL axes
 * (`warpSurfaceFrame`'s own `along`/`across` at this point), never to
 * `frame`'s own axes: `armOffsetFrameAt`'s `along` runs along the WOUND arm
 * tangent, not azimuthally, so `frame` and the reference frame generally
 * disagree about where angle zero is.
 *
 * `across`'s handedness relative to `pole x along` varies by caller
 * (`armOffsetFrameAt` flips it to point inward) — `s` below recovers
 * whichever sign is live so the frame turns the same physical direction the
 * measured angle was defined in, not its mirror image.
 *
 * `stats`, when supplied, records every |delta| this call actually applied
 * — INCLUDING the coherence-0 early return (delta 0, a real "no rotation
 * here" data point, not a skip) — so `OrientationDeltaStats`'s mean stays
 * honest about how much of the grid has no measured structure to turn
 * toward, rather than only averaging over the texels that did.
 */
function rotateFrameToOrientation(
  frame: CloudFrame,
  radius: number,
  angle: number,
  geometry: GalaxyFieldGeometry,
  orientation: GalaxySfMapOrientation | null | undefined,
  stats: OrientationDeltaStats | undefined,
): CloudFrame {
  if (!orientation) return frame;
  const sample = sampleSfMapOrientation(orientation, radius, angle);
  if (sample.coherence <= 0) {
    recordOrientationDelta(stats, 0);
    return frame;
  }

  const ref = warpSurfaceFrame(radius, angle, geometry);
  const currentAngle = Math.atan2(dot3(frame.along, ref.across), dot3(frame.along, ref.along));
  // A filament orientation wraps at PI (no head/tail) — wrap the
  // DIFFERENCE, not the absolute angles, or a +80/-100deg pair (the SAME
  // ellipse) reads as a ~180deg raw delta and the coherence blend below
  // lands on a bogus partial rotation instead of ~0.
  const rawDelta = sample.angle - currentAngle;
  const delta = sample.coherence * (rawDelta - Math.PI * Math.round(rawDelta / Math.PI));
  recordOrientationDelta(stats, Math.abs(delta) * (180 / Math.PI));

  const rot90 = cross3(frame.pole, frame.along); // pole x along — see header
  const s = dot3(frame.across, rot90) >= 0 ? 1 : -1;
  const cos = Math.cos(delta);
  const sin = Math.sin(delta) * s;
  const along: Vec3 = [
    frame.along[0] * cos + frame.across[0] * sin,
    frame.along[1] * cos + frame.across[1] * sin,
    frame.along[2] * cos + frame.across[2] * sin,
  ];
  const across: Vec3 = [
    frame.across[0] * cos - frame.along[0] * sin,
    frame.across[1] * cos - frame.along[1] * sin,
    frame.across[2] * cos - frame.along[2] * sin,
  ];
  return { along, across, pole: frame.pole };
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
    // The RETURNED frame — not `center` above, which stays on the true
    // lane geometry — is what elongation ultimately reads, so only it turns
    // toward the measured filament. Sampled at `frame.point` itself (not the
    // un-offset ridge, which this shared config type doesn't carry): the
    // lane offset is a small fraction of `discLightScaleLength`, well under
    // the automaton grid's own resolution.
    const orientedFrame = rotateFrameToOrientation(
      { along: frame.along, across: frame.across, pole: frame.pole },
      Math.hypot(frame.point[0], frame.point[2]),
      Math.atan2(frame.point[2], frame.point[0]),
      geometry,
      config.sfMapOrientation,
      config.orientationDeltaStats,
    );
    return { center, frame: orientedFrame };
  }

  function placeSmoothDiscComplex(): { center: Vec3; frame: CloudFrame } {
    const k = pickWeighted(rng, config.discWeights, config.discWeightSum);
    const sigmaR = config.discSigmaR(k);
    const x = gaussian(rng) * sigmaR;
    const z = gaussian(rng) * sigmaR;
    const y = gaussian(rng) * sigmaZComplex;
    const radius = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    const frame = rotateFrameToOrientation(
      warpSurfaceFrame(radius, angle, geometry),
      radius,
      angle,
      geometry,
      config.sfMapOrientation,
      config.orientationDeltaStats,
    );
    return { center: [x, y, z], frame };
  }

  /**
   * Map-density-only placement: the SF map IS the density, `armBias` plays
   * no role. Proposes `(x, z)` from the same radial distribution
   * `placeSmoothDiscComplex` draws from (so the exponential disc falloff and
   * scale height carry over unmodified), rejection-samples against
   * `mapDensityAt`, and accepts the last proposal if the budget runs out —
   * the requested particle count is always met. `y` doesn't feed the
   * acceptance test, so it's drawn once after the loop rather than re-rolled
   * per try.
   */
  function placeMapDensityComplex(mapDensityAt: (radius: number, angle: number) => number): {
    center: Vec3;
    frame: CloudFrame;
  } {
    let x = 0;
    let z = 0;
    let radius = 0;
    let angle = 0;
    for (let tries = 0; tries < MAP_DENSITY_REJECTION_TRIES; tries++) {
      const k = pickWeighted(rng, config.discWeights, config.discWeightSum);
      const sigmaR = config.discSigmaR(k);
      x = gaussian(rng) * sigmaR;
      z = gaussian(rng) * sigmaR;
      radius = Math.hypot(x, z);
      angle = Math.atan2(z, x);
      if (rng() < mapDensityAt(radius, angle)) break;
    }
    const y = gaussian(rng) * sigmaZComplex;
    const frame = rotateFrameToOrientation(
      warpSurfaceFrame(radius, angle, geometry),
      radius,
      angle,
      geometry,
      config.sfMapOrientation,
      config.orientationDeltaStats,
    );
    return { center: [x, y, z], frame };
  }

  /** OFF path (no map density): identical to before `mapDensityAt` existed — armRoll is always drawn, even when `canUseArms` is false, so the rng draw order never shifts. */
  function placeAnalyticComplex(): { center: Vec3; frame: CloudFrame } {
    // Arm bias re-rolled per complex, not per particle — a complex (and its
    // children) is the hierarchical unit real GMC/OB associations form at.
    const armRoll = rng();
    return (
      (canUseArms && armRoll < armBias ? placeArmLaneComplex() : null) ?? placeSmoothDiscComplex()
    );
  }

  const particles: PlacedParticle<TPayload>[] = [];
  let placed = 0;
  while (placed < count) {
    const childCount = Math.min(childrenPerComplex, count - placed);
    const placement = config.mapDensityAt
      ? placeMapDensityComplex(config.mapDensityAt)
      : placeAnalyticComplex();

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
