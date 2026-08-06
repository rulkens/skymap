/**
 * buildClusteredDiscPlacement — the two-level complex/children scatter
 * shared by every stochastic particle tier on the analytic field (dust GMCs,
 * arm emission sprites): seed one "complex" via one of three modes —
 * `'analytic'` (weighted arm lane, falling back to the smooth disc),
 * `'mapDensity'` (the SSPSF automaton's measured density), or bare
 * `'smoothDisc'` — then scatter its children around it. See
 * `ClusteredDiscPlacementMode` for what each mode needs from its caller.
 * Extracted out of `dustParticleCloud.ts` so a second tier doesn't restate
 * this sampler.
 *
 * Per-child payload (a size draw, in both current consumers) is drawn via
 * `drawPayload`, called INLINE in the placement loop rather than in a
 * separate pass over the result: the rng draw ORDER is load-bearing (same
 * seed must keep producing the same cloud), and a separate payload pass
 * would interleave differently against the next complex's own draws.
 *
 * PURITY INVARIANT: pure given its `rng`, no Math.random/Date/engine state.
 */
import { ARM_SPAN_START_FRAC } from './armRidgeGeometry';
import { armAgeWeight } from './dustLaneFeatures';
import { sampleIsmMapOrientation } from '../../../../utils/galaxy/sampleIsmMapOrientation';
import { warpHeight } from '../../../../utils/galaxy/warpHeight';
import { warpSurfaceFrame } from '../../../../utils/galaxy/warpSurfaceFrame';
import { gaussian } from '../../../../utils/random/gaussian';
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyIsmMapOrientation } from '../../../../@types/galaxy/GalaxyIsmMapOrientation';
import type { Vec3 } from '../../../../@types/math/Vec3';

/**
 * Bounded rejection sampling against `armFadeEnvelope` when seeding a complex
 * on an arm lane. Exhausting it keeps the LAST draw — an unweighted sample,
 * not `placeMapDensityComplex`'s best-so-far — so an acceptance that runs low
 * over much of the arm leaks a uniform tail into the placement density
 * (`GalaxyArmCloudTuning.radialBias` measures what that costs at high tilt).
 */
const ARM_FADE_REJECTION_TRIES = 24;

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

/**
 * How a complex picks its seed point — the one axis the two current
 * consumers genuinely differ on. `'analytic'` is the arm-lane/smooth-disc
 * roll (`armParticleCloud.ts`, which IS the arm feature and always passes
 * `armBias: 1`); `'mapDensity'` replaces that roll entirely with the SSPSF
 * automaton's measured density (`dustParticleCloud.ts`, once its ISM map is
 * usable); `'smoothDisc'` is the bare disc profile with no lane concept at
 * all (`dustParticleCloud.ts`'s no-map fallback). A tagged union rather than
 * three optional sibling fields: the dust caller has no lane callbacks to
 * give in the latter two modes, so nullable siblings would only exist to
 * satisfy the type.
 */
export type ClusteredDiscPlacementMode =
  | {
      readonly kind: 'analytic';
      /** 0..1 probability a complex seeds on an arm lane rather than the smooth disc. */
      readonly armBias: number;
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
       * outward and cancels the tilt in flux).
       */
      readonly laneAcceptance: (arm: GalaxyFieldArmRecord, radius: number) => number;
      /** Cross-lane (across-arm) one-sigma spread at a radius — already whatever fraction of the arm's own width the caller wants. */
      readonly crossLaneSigma: (radius: number) => number;
    }
  | {
      readonly kind: 'mapDensity';
      /**
       * Draws one (radius, angle) exactly proportional to the ISM map's
       * placement density — S1's inverse-CDF sampler
       * (`buildIsmMapDustCdf`/`sampleIsmMapDustCdf`), built once per cloud by
       * the caller. Fixed THREE rng draws every call regardless of map
       * contrast — see `sampleIsmMapDustCdf`'s own header.
       */
      readonly samplePoint: (rng: () => number) => {
        readonly radius: number;
        readonly angle: number;
      };
    }
  | { readonly kind: 'smoothDisc' };

export type ClusteredDiscPlacementConfig = {
  readonly geometry: GalaxyDescription;
  readonly rng: () => number;
  /** Total particle count across every complex. */
  readonly count: number;
  /** 0..1 hierarchical clustering: 0 = every particle its own complex, 1 = ~16 children per complex. */
  readonly clumpiness: number;
  /** One-sigma child scatter around its complex centre, before `elongation`. Unused at `clumpiness` low enough to give one child per complex — see `childSpread`. */
  readonly complexSpread: number;
  /** sigma_along / sigma_across for the child scatter. */
  readonly elongation: number;
  /** Complex-level vertical (pole-axis) one-sigma scatter. */
  readonly sigmaZComplex: number;
  /** Smooth-disc fallback: component k's radial sigma. */
  readonly discSigmaR: (k: number) => number;
  /** Smooth-disc fallback: DISC_SURFACE_WEIGHTS-shaped weights to pick k with, and their sum. */
  readonly discWeights: readonly number[];
  readonly discWeightSum: number;
  /**
   * The SSPSF automaton's measured filament orientation, coherence-weighted
   * so a texel with no measured structure reproduces today's frame exactly —
   * see `rotateFrameToOrientation`. `null` (the default, and every caller's
   * `ismMap.generator === 'none'` path) is a pure no-op: no extra work, no
   * extra `rng` draw, so the gated-off placement stays byte-identical.
   */
  readonly ismMapOrientation?: GalaxyIsmMapOrientation | null;
  /** Out-param, mutated once per complex whenever `ismMapOrientation` is non-null — see `OrientationDeltaStats`'s own doc. Omitted (the default) does no extra work. */
  readonly orientationDeltaStats?: OrientationDeltaStats;
  /** Which of the three seeding modes this build uses — see `ClusteredDiscPlacementMode`. */
  readonly placement: ClusteredDiscPlacementMode;
};

export type PlacedParticle<TPayload> = { center: Vec3; readonly frame: CloudFrame } & TPayload;

/** Exported so `hiiRegions.ts`'s bespoke DIG complex loop can pick a weighted arm the same way this sampler does, rather than restate it. */
export function pickWeighted(rng: () => number, weights: readonly number[], sum: number): number {
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
 * (`along`/`across`) toward the ISM-map automaton's measured filament
 * orientation, coherence-weighted so a texel with no measured structure
 * (coherence 0) reproduces `frame` exactly. `pole` never moves.
 *
 * The measured angle is relative to the AZIMUTHAL/RADIAL axes
 * (`warpSurfaceFrame`'s own `along`/`across` at this point), never to
 * `frame`'s own axes: a lane frame's `along` (e.g. `armRidgeFrameAt`'s) runs
 * along the WOUND arm tangent, not azimuthally, so `frame` and the reference
 * frame generally disagree about where angle zero is.
 *
 * `across`'s handedness relative to `pole x along` is caller-defined, not
 * fixed by this function — `s` below recovers whichever sign the passed-in
 * frame actually uses so the frame turns the same physical direction the
 * measured angle was defined in, not its mirror image.
 *
 * `stats`, when supplied, records every |delta| this call actually applied
 * — INCLUDING the coherence-0 early return (delta 0, a real "no rotation
 * here" data point, not a skip) — so `OrientationDeltaStats`'s mean stays
 * honest about how much of the grid has no measured structure to turn
 * toward, rather than only averaging over the texels that did.
 */
export function rotateFrameToOrientation(
  frame: CloudFrame,
  radius: number,
  angle: number,
  geometry: GalaxyDescription,
  orientation: GalaxyIsmMapOrientation | null | undefined,
  stats: OrientationDeltaStats | undefined,
): CloudFrame {
  if (!orientation) return frame;
  const sample = sampleIsmMapOrientation(orientation, radius, angle);
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
 * Places `config.count` particles across complexes of `1 + 15*clumpiness`
 * children each, every complex seeded per `config.placement`'s mode.
 * `drawPayload` runs once per child, immediately after its centre/frame are
 * fixed, so a consumer's own per-particle randomness lands in the same rng
 * draw slot the sampler has always used it at.
 */
export function buildClusteredDiscPlacement<TPayload>(
  config: ClusteredDiscPlacementConfig,
  drawPayload: (rng: () => number, center: Vec3, frame: CloudFrame) => TPayload,
): PlacedParticle<TPayload>[] {
  const { geometry, rng, count, clumpiness, complexSpread, elongation, sigmaZComplex } = config;
  const childrenPerComplex = Math.max(1, Math.round(1 + 15 * clumpiness));
  // A one-member complex has no siblings to scatter AROUND anything: the child
  // IS the complex, so it belongs at the seed point `placeComplex` drew from
  // the placement density. Scattering it anyway convolves that density with a
  // ~complexSpread kernel — at clumpiness 0, where every complex is a lone
  // child, that blurs the ISM map the `'mapDensity'` mode exists to follow.
  // Keyed on the CONFIGURED children per complex, not the per-complex
  // `childCount` below, which the count budget can truncate to 1 on the tail
  // complex of a genuinely clustered build.
  const childSpread = childrenPerComplex > 1 ? complexSpread : 0;
  const canUseArms = geometry.numArms > 0;
  const armWeights = geometry.arms.map((arm) => armAgeWeight(arm));
  const armWeightSum = armWeights.reduce((s, w) => s + w, 0);

  /** A complex seeded on an arm's lane, or null if this arm has no valid span (falls back to the smooth disc). */
  function placeArmLaneComplex(
    mode: Extract<ClusteredDiscPlacementMode, { kind: 'analytic' }>,
  ): { center: Vec3; frame: CloudFrame; warped: boolean } | null {
    const armIndex = pickWeighted(rng, armWeights, armWeightSum);
    const arm = geometry.arms[armIndex]!;
    const logMin = Math.log(ARM_SPAN_START_FRAC);
    const logMax = Math.log(arm.fadeRadius / geometry.armStartRadius);
    if (!(logMax > logMin)) return null;

    let logR = logMin;
    let radius = geometry.armStartRadius;
    for (let tries = 0; tries < ARM_FADE_REJECTION_TRIES; tries++) {
      logR = logMin + rng() * (logMax - logMin);
      radius = geometry.armStartRadius * Math.exp(logR);
      if (rng() < mode.laneAcceptance(arm, radius)) break;
    }

    const frame = mode.laneFrameAt(arm, logR);
    if (!frame) return null;
    const laneSpread = mode.crossLaneSigma(radius);
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
      config.ismMapOrientation,
      config.orientationDeltaStats,
    );
    return { center, frame: orientedFrame, warped: true };
  }

  function placeSmoothDiscComplex(): { center: Vec3; frame: CloudFrame; warped: boolean } {
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
      config.ismMapOrientation,
      config.orientationDeltaStats,
    );
    return { center: [x, y, z], frame, warped: false };
  }

  /**
   * Map-density-only placement: the ISM map IS the density, no arm-lane roll
   * involved. `mode.samplePoint` (S1's inverse-CDF sampler, built once per
   * cloud by the caller) draws the centre exactly proportional to the map's
   * accumulated density x area — no rejection, no fallback, so unlike the
   * old rejection loop this mode's rng draw count never varies with map
   * contrast. `y` isn't part of that draw, so it's drawn once after.
   */
  function placeMapDensityComplex(
    mode: Extract<ClusteredDiscPlacementMode, { kind: 'mapDensity' }>,
  ): {
    center: Vec3;
    frame: CloudFrame;
    warped: boolean;
  } {
    const { radius, angle } = mode.samplePoint(rng);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = gaussian(rng) * sigmaZComplex;
    const frame = rotateFrameToOrientation(
      warpSurfaceFrame(radius, angle, geometry),
      radius,
      angle,
      geometry,
      config.ismMapOrientation,
      config.orientationDeltaStats,
    );
    return { center: [x, y, z], frame, warped: false };
  }

  /** `'analytic'` mode: armRoll is always drawn, even when `canUseArms` is false, so the rng draw order never shifts with geometry. */
  function placeAnalyticComplex(mode: Extract<ClusteredDiscPlacementMode, { kind: 'analytic' }>): {
    center: Vec3;
    frame: CloudFrame;
    warped: boolean;
  } {
    // Arm bias re-rolled per complex, not per particle — a complex (and its
    // children) is the hierarchical unit real GMC/OB associations form at.
    const armRoll = rng();
    return (
      (canUseArms && armRoll < mode.armBias ? placeArmLaneComplex(mode) : null) ??
      placeSmoothDiscComplex()
    );
  }

  /**
   * One dispatch per mode kind — a switch rather than a lookup table: unlike
   * a uniform "call the function matching this key", the `'analytic'` branch
   * carries its own extra logic (the arm-bias roll and lane/smooth-disc
   * fallback) rather than a single 1:1 function call, so a table entry would
   * just be this same function wrapped in an object literal.
   */
  function placeComplex(mode: ClusteredDiscPlacementMode): {
    center: Vec3;
    frame: CloudFrame;
    warped: boolean;
  } {
    switch (mode.kind) {
      case 'analytic':
        return placeAnalyticComplex(mode);
      case 'mapDensity':
        return placeMapDensityComplex(mode);
      case 'smoothDisc':
        return placeSmoothDiscComplex();
    }
  }

  const particles: PlacedParticle<TPayload>[] = [];
  let placed = 0;
  while (placed < count) {
    const childCount = Math.min(childrenPerComplex, count - placed);
    const placement = placeComplex(config.placement);

    for (let c = 0; c < childCount; c++) {
      // Drawn even when `childSpread` is 0: the rng ORDER is load-bearing (see
      // header), so a lone child must consume the same stream a clustered one
      // would, leaving every later complex's seed point where it was.
      const along = gaussian(rng) * childSpread * elongation;
      const across = gaussian(rng) * childSpread;
      const pole = gaussian(rng) * childSpread * CHILD_POLE_RATIO;
      const x =
        placement.center[0] +
        placement.frame.along[0] * along +
        placement.frame.across[0] * across +
        placement.frame.pole[0] * pole;
      const z =
        placement.center[2] +
        placement.frame.along[2] * along +
        placement.frame.across[2] * across +
        placement.frame.pole[2] * pole;
      const yFlat =
        placement.center[1] +
        placement.frame.along[1] * along +
        placement.frame.across[1] * across +
        placement.frame.pole[1] * pole;
      // `placement.warped` is false for `smoothDisc`/`mapDensity` complexes
      // (and the arm-lane fallback): those seed at y=0, tilted but never
      // lifted (`armRidgeCurvePoint` bakes the lift in for the arm-lane path
      // already). Cross-tier contract: a cloud must warp like the analytic
      // components it renders alongside (`pushWarpedOuterDisc`, the ridge
      // blobs) or the tiers split at the rim. Lifted at THIS child's own
      // (x, z), not the complex's, so a spread-out child bends with the disc
      // — no rng draw, so draw order is unaffected.
      const y = placement.warped
        ? yFlat
        : yFlat + warpHeight(Math.hypot(x, z), Math.atan2(z, x), geometry);
      const center: Vec3 = [x, y, z];
      const payload = drawPayload(rng, center, placement.frame);
      particles.push({ center, frame: placement.frame, ...payload });
    }
    placed += childCount;
  }

  return particles;
}
