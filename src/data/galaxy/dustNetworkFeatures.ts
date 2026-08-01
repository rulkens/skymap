/**
 * buildDustNetworkFeatures — the full PHANGS-style dust network (design doc
 * N2): arm lanes, spurs/feathers, bubbles and GMC beads, in that priority
 * order, as one flat feature list `dustFeature.wesl` draws unchanged. Pure
 * `(geometry, dust, seed) -> flat data`, no engine state, no per-frame CPU
 * work — same discipline as `dustLaneFeatures.ts`/`sfEventCatalog.ts`, and a
 * Worker/compute-shader candidate for the same reason.
 *
 * PURITY INVARIANT: no reads of engine/render state, no Date/Math.random —
 * every bit of variation comes from `seed`. Violating this makes a repack
 * order-dependent in a way that would only show up as a flicker in the field.
 *
 * Ledger note (v1): spurs and beads ADD column nothing debits yet, and
 * rimGain < 1 bubbles remove net column — only the lanes' own f_arm debit
 * (`armCarriedDustFraction`) stands in for the whole network's budget. See
 * the research doc's N1b for the exact zero-mean discipline a later pass
 * should apply; this pass does not invent a new ledger.
 *
 * Per-class budgets (below) exist because a literal reading of the measured
 * densities (500 pc spur spacing, 0.12-unit bead spacing) over the
 * generator's long, tightly wound arms floods a single shared cap and starves
 * whichever class packs last — see the 2026-08 calibration finding. Each
 * class now thins ITSELF to its own fixed slice of `DUST_NETWORK_FEATURE_CAP`
 * instead of losing a priority fight.
 */
import { mulberry32 } from '../../utils/random/mulberry32';
import { buildDustBubblePlacementDetails, pcToUnits } from './dustBubblePlacements';
import {
  armAgeWeight,
  armLaneWidthAndAmplitude,
  armOffsetFrameAt,
  buildDustLaneFeatures,
  distance3,
  DUST_LANE_FEATURE_CAP,
  EDGE_SHARPNESS,
  NOISE_WAVELENGTH_FRACTION,
  TAPER_FRACTION,
} from './dustLaneFeatures';
import { armFadeEnvelope } from './galaxyFieldMixture';
import { dustFaceOnColumn } from './galaxyDustMixture';
import type { ArmOffsetFrame } from './dustLaneFeatures';
import type { GalaxyDustFeature } from '../../@types/galaxy/GalaxyDustFeature';
import type { GalaxyDustParams } from '../../@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldArmRecord } from '../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Runaway-input guard: never hand the shader more than this many feature
 * quads across all four classes combined. `createGalaxyEngine.ts` sizes
 * `fieldFeatsBuf`'s starting capacity off this same number, so a single
 * galaxy's network never forces a first-frame regrow.
 */
export const DUST_NETWORK_FEATURE_CAP = 1024;

/** Lane class' own existing bound (highest visual priority, N2 #1) — unchanged. */
const LANE_BUDGET = DUST_LANE_FEATURE_CAP;
/** 160 chains x 3 segments — second priority (N2 #2). */
const SPUR_BUDGET = 480;
/** Remainder of the 1024 total — lowest priority, highest-candidate-count class (N2 #4). */
const BEAD_BUDGET = 168;
// LANE_BUDGET + SPUR_BUDGET + BUBBLE_BUDGET + BEAD_BUDGET === DUST_NETWORK_FEATURE_CAP
// (256 + 480 + 120 + 168 === 1024) — keep them summing exactly so
// `buildDustNetworkFeatures`'s closing slice stays a pure safety net.
// BUBBLE_BUDGET (third priority, N2 #3) now lives in `dustBubblePlacements.ts`,
// which owns the whole bubble placement pass — imported above.

// ---- Shared arm-curve walk (spurs + beads) --------------------------------

type ArmOffsetWalk = {
  readonly frames: readonly ArmOffsetFrame[];
  readonly cumArc: readonly number[];
  readonly totalArc: number;
};

/**
 * sampleArmOffsetWalk — one arm's offset curve, densely sampled once, with
 * cumulative arc length at each sample. Shared by the spur and bead classes,
 * both of which need the curve's TOTAL arc length (to derive a budget-aware
 * spacing/density) and a walk to place features along — sampling once serves
 * both rather than measuring and then re-walking.
 */
function sampleArmOffsetWalk(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  arm: GalaxyFieldArmRecord,
  steps: number,
): ArmOffsetWalk | null {
  const { armStartRadius } = geometry;
  const rStart = armStartRadius * 1.05;
  const rEnd = arm.fadeRadius;
  if (rEnd <= rStart) return null;
  const logStart = Math.log(rStart / armStartRadius);
  const logEnd = Math.log(rEnd / armStartRadius);

  const frames: ArmOffsetFrame[] = [armOffsetFrameAt(logStart, geometry, dust, arm)];
  const cumArc: number[] = [0];
  for (let i = 1; i <= steps; i++) {
    const logR = logStart + ((logEnd - logStart) * i) / steps;
    const frame = armOffsetFrameAt(logR, geometry, dust, arm);
    cumArc.push(
      cumArc[cumArc.length - 1]! + distance3(frames[frames.length - 1]!.point, frame.point),
    );
    frames.push(frame);
  }
  return { frames, cumArc, totalArc: cumArc[cumArc.length - 1]! };
}

type ArmWalkEntry = {
  readonly arm: GalaxyFieldArmRecord;
  readonly armIndex: number;
  readonly walk: ArmOffsetWalk;
};

function buildArmOffsetWalks(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  steps: number,
): readonly ArmWalkEntry[] {
  const out: ArmWalkEntry[] = [];
  geometry.arms.forEach((arm, armIndex) => {
    const walk = sampleArmOffsetWalk(geometry, dust, arm, steps);
    if (walk) out.push({ arm, armIndex, walk });
  });
  return out;
}

// ---- Spurs/feathers (N2 #2) ----------------------------------------------

/** Base quasi-regular spur spacing, 500 pc — ×`network.spurSpacing`. Measured 300-800 pc (secondary-sourced), La Vigne/Vogel/Ostriker 2006. */
const SPUR_SPACING_BASE = 0.3;
/** ±25% jitter around the quasi-regular spacing target. */
const SPUR_SPACING_JITTER = 0.25;
/** Root pitch off the local lane tangent — measured ~60 deg (secondary-sourced). */
const SPUR_PITCH_RAD = (60 * Math.PI) / 180;
/** Per-segment pitch taper, giving the 3-segment chain a gentle curve rather than a straight kink — stylized, not measured. */
const SPUR_CURVE_STEP = 0.15;
/** Base total spur length, 1.2 kpc — ×`network.spurLength`. Measured 1-5 kpc (secondary-sourced). */
const SPUR_LENGTH_BASE = 0.72;
const SPUR_SEGMENTS = 3;
const SPUR_WIDTH_FRACTION = 0.6;
const SPUR_AMPLITUDE_FRACTION = 0.5;
/** Arc-length walk resolution — independent of the lane's own render resolution (`STEPS_PER_ARM`), fine enough to place roots within a few % of the jittered target spacing. */
const SPUR_FINE_STEPS = 400;
/** Arbitrary prime offset, keeps the spur RNG stream independent of the bead one below despite sharing the same `seed`. */
const SPUR_SEED_OFFSET = 104729;

function rotateInPlane(along: Vec3, across: Vec3, angleRad: number): Vec3 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return [along[0] * c + across[0] * s, along[1] * c + across[1] * s, along[2] * c + across[2] * s];
}

function buildSpurFeatures(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  seed: number,
): GalaxyDustFeature[] {
  if (dust.tau <= 0 || geometry.numArms <= 0 || dust.network.spurStrength <= 0) return [];
  const baseSpacing = SPUR_SPACING_BASE * dust.network.spurSpacing;
  if (baseSpacing <= 0) return [];
  const segLen = (SPUR_LENGTH_BASE * dust.network.spurLength) / SPUR_SEGMENTS;
  if (segLen <= 0) return [];

  const walks = buildArmOffsetWalks(geometry, dust, SPUR_FINE_STEPS);
  const totalArcAllArms = walks.reduce((sum, w) => sum + w.walk.totalArc, 0);
  if (totalArcAllArms <= 0) return [];

  // The MEASURED property is quasi-regularity, not the absolute count: when
  // the literature's 500 pc spacing over the generator's long, tightly
  // wound arms would flood SPUR_BUDGET (160 chains total), the spacing
  // stretches UNIFORMLY — one shared factor across every arm, not a
  // per-arm patchwork — so placement stays quasi-regular instead of
  // degrading to a sparse/dense mess. `spurSpacing` still scales the floor
  // underneath this budget-derived term.
  const effectiveSpacing = Math.max(baseSpacing, totalArcAllArms / (SPUR_BUDGET / SPUR_SEGMENTS));

  const rng = mulberry32(seed + SPUR_SEED_OFFSET);
  const out: GalaxyDustFeature[] = [];

  for (const { arm, armIndex, walk } of walks) {
    const ageWeight = armAgeWeight(arm);
    let lastPlacedArc = 0;
    let nextTarget = effectiveSpacing * (1 + (rng() * 2 - 1) * SPUR_SPACING_JITTER);
    for (let i = 1; i < walk.frames.length; i++) {
      const arcHere = walk.cumArc[i]!;
      if (arcHere - lastPlacedArc < nextTarget) continue;
      lastPlacedArc = arcHere;
      nextTarget = effectiveSpacing * (1 + (rng() * 2 - 1) * SPUR_SPACING_JITTER);

      const frame = walk.frames[i]!;
      const fade = armFadeEnvelope(frame.radius, geometry, arm);
      const { width: laneWidth, amplitude: laneAmplitude } = armLaneWidthAndAmplitude(
        frame.radius,
        geometry,
        dust,
        ageWeight,
        fade,
      );
      if (laneWidth <= 0 || laneAmplitude <= 0) continue;

      // ageWeight applied a SECOND time on top of `laneAmplitude`'s own: the
      // lane's weighting says how much column a young arm carries, but
      // spurs need the STRONGER gate La Vigne/Vogel/Ostriker measured (83%
      // incidence given a strong lane) — a bias on top of the lane's own,
      // not a restatement of it. Amplitude is otherwise UNCHANGED by the
      // budget above: fewer spurs is honest (the true count thinned to a
      // renderable one); dimmer spurs would not be — each spur is an
      // object, not a flux share.
      const spurAmplitude =
        laneAmplitude * SPUR_AMPLITUDE_FRACTION * dust.network.spurStrength * ageWeight;
      if (spurAmplitude <= 0) continue;
      const spurWidth = SPUR_WIDTH_FRACTION * laneWidth;

      // "Toward trailing" is realised as -across (the side opposite the
      // lane's own inward shock offset): spurs peel OUT of the arm into
      // inter-arm space (design N2 #2). A consistent chirality per arm,
      // stylized since no measured spur-curl sign exists.
      const outward: Vec3 = [-frame.across[0], -frame.across[1], -frame.across[2]];
      let p0 = frame.point;
      let sOffset = 0;
      for (let j = 0; j < SPUR_SEGMENTS; j++) {
        const angle = SPUR_PITCH_RAD * (1 - j * SPUR_CURVE_STEP);
        const dir = rotateInPlane(frame.along, outward, angle);
        const p1: Vec3 = [
          p0[0] + dir[0] * segLen,
          p0[1] + dir[1] * segLen,
          p0[2] + dir[2] * segLen,
        ];

        out.push({
          p0,
          p1,
          normal: frame.pole,
          width: spurWidth,
          amplitude: spurAmplitude,
          edgeSharpness: EDGE_SHARPNESS,
          noiseSeed: (seed % 1000) + armIndex * 37 + 500,
          noiseAmp: dust.network.texture,
          noiseFreq: 1 / (NOISE_WAVELENGTH_FRACTION * segLen),
          kind: 0,
          sOffset,
          // Free-standing chain: both ends taper, unlike the lane (which
          // butts its neighbours at every interior joint).
          taperIn: j === 0 ? TAPER_FRACTION * segLen : 0,
          taperOut: j === SPUR_SEGMENTS - 1 ? TAPER_FRACTION * segLen : 0,
        });

        sOffset += segLen;
        p0 = p1;
      }
    }
  }

  return out;
}

// ---- Bubbles (N2 #3) ------------------------------------------------------

/** Hole depth as a fraction of the local lane-ish column. */
const BUBBLE_HOLE_DEPTH_FRACTION = 0.6;

/** Placement (age-gated event -> center/radius, largest-first budget cap) lives in `dustBubblePlacements.ts`, shared with the particle cloud's carving pass; this class only shapes the flat rim/hole record. */
function buildBubbleFeatures(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  seed: number,
): GalaxyDustFeature[] {
  return buildDustBubblePlacementDetails(geometry, dust, seed).map((placement) => ({
    p0: placement.center,
    // p1 unused for kind >= 1 (disc primitives) — a throwaway unit offset
    // so the shader's unguarded fragment-side `seg/len` division never
    // sees zero (see dustFeature.wesl's kind branch).
    p1: [placement.center[0] + 1, placement.center[1], placement.center[2]],
    normal: placement.pole,
    width: placement.radius,
    amplitude: placement.laneAmplitude * BUBBLE_HOLE_DEPTH_FRACTION,
    edgeSharpness: EDGE_SHARPNESS,
    noiseSeed: 0,
    // rimGain rides this lane for kind 1 — see io.wesl's FEATS table.
    noiseAmp: dust.network.bubbleRimStrength,
    noiseFreq: 0,
    kind: 1,
    sOffset: 0,
    taperIn: 0,
    taperOut: 0,
  }));
}

// ---- GMC beads (N2 #4) -----------------------------------------------------

/** Mean along-lane spacing between bead candidates. */
const BEAD_SPACING = 0.12;
/** Placement density at each candidate slot — eyeball, not measured. */
const BEAD_ACCEPT_PROB = 0.5;
/** Literature interarm-mass-ratio anchor is 2.5x; scaled down for a subtle start (build-up-slowly instruction), same spirit as the dust lane's own tau floor. */
const BEAD_AMPLITUDE_SCALE = 1.2;
const BEAD_FINE_STEPS = 400;
/** Arbitrary prime offset, independent of the spur RNG stream above. */
const BEAD_SEED_OFFSET = 15485863;

function buildBeadFeatures(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  seed: number,
): GalaxyDustFeature[] {
  if (dust.tau <= 0 || geometry.numArms <= 0) return [];
  if (dust.network.beadShare <= 0 || dust.network.texture <= 0) return [];

  const walks = buildArmOffsetWalks(geometry, dust, BEAD_FINE_STEPS);
  const totalArcAllArms = walks.reduce((sum, w) => sum + w.walk.totalArc, 0);
  if (totalArcAllArms <= 0) return [];

  // expectedCount = arc length / spacing: the number of candidate slots the
  // walk below will visit. Scaling BEAD_ACCEPT_PROB by min(1, BEAD_BUDGET /
  // expectedCount) targets the budget while keeping the SAME rng()
  // consumption order regardless of the scale factor — every candidate slot
  // still draws exactly once; only the threshold it's compared against
  // moves. Thinning the THRESHOLD (not skipping draws) is what keeps seeded
  // determinism intact: the sequence of which slots get an rng() call never
  // depends on the budget.
  const expectedCount = totalArcAllArms / BEAD_SPACING;
  const acceptProb = BEAD_ACCEPT_PROB * Math.min(1, BEAD_BUDGET / expectedCount);

  const rng = mulberry32(seed + BEAD_SEED_OFFSET);
  const out: GalaxyDustFeature[] = [];

  for (const { walk } of walks) {
    let lastPlacedArc = 0;
    for (let i = 1; i < walk.frames.length; i++) {
      const arcHere = walk.cumArc[i]!;
      if (arcHere - lastPlacedArc < BEAD_SPACING) continue;
      lastPlacedArc = arcHere;
      if (rng() >= acceptProb) continue;

      const frame = walk.frames[i]!;
      const radiusPc = 40 + 60 * rng();
      const R = pcToUnits(radiusPc);
      // The GLOBAL lane's own column (not the arm-carried share the lane/
      // spur/bubble classes above read) — beads are scaled off the smooth
      // field's raw density, per the design doc's "global-lane column" wording.
      const column = dustFaceOnColumn(frame.radius, geometry, dust);
      const amplitude =
        column * BEAD_AMPLITUDE_SCALE * dust.network.texture * dust.network.beadShare;
      if (amplitude <= 0) continue;

      out.push({
        p0: frame.point,
        p1: [frame.point[0] + 1, frame.point[1], frame.point[2]],
        normal: frame.pole,
        width: R,
        amplitude,
        edgeSharpness: EDGE_SHARPNESS,
        noiseSeed: 0,
        noiseAmp: 0,
        noiseFreq: 0,
        kind: 2,
        sOffset: 0,
        taperIn: 0,
        taperOut: 0,
      });
    }
  }

  return out;
}

/**
 * buildDustNetworkFeatures — lanes, then spurs, bubbles and beads, each
 * already thinned to its own budget above, concatenated once.
 */
export function buildDustNetworkFeatures(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  seed: number,
): readonly GalaxyDustFeature[] {
  const lanes = buildDustLaneFeatures(geometry, dust, seed).slice(0, LANE_BUDGET);
  const spurs = buildSpurFeatures(geometry, dust, seed).slice(0, SPUR_BUDGET);
  const bubbles = buildBubbleFeatures(geometry, dust, seed); // already budget-capped, largest-first
  const beads = buildBeadFeatures(geometry, dust, seed).slice(0, BEAD_BUDGET);
  const combined = [...lanes, ...spurs, ...bubbles, ...beads];
  // Pure safety net: the four budgets above sum to DUST_NETWORK_FEATURE_CAP
  // exactly and every class already thinned itself to its own slice, so this
  // never actually removes anything — it only guards a future budget edit
  // that breaks the sum from overflowing the shader's storage buffer.
  return combined.slice(0, DUST_NETWORK_FEATURE_CAP);
}
