/**
 * The arm dust lane's shared geometry and ledger: where a lane sits relative
 * to its arm's stellar ridge (`armOffsetFrameAt`), how wide it is and how
 * much of the global column it carries at a radius
 * (`armLaneWidthAndAmplitude`), and how strongly an arm's age weights it
 * (`armAgeWeight`). `dustParticleCloud.ts`, `clusteredDiscPlacement.ts` and
 * `dustBubblePlacements.ts` all place themselves on these rather than
 * re-deriving either the curve or the ledger.
 *
 * PURITY INVARIANT: no reads of engine/render state, no Date/Math.random —
 * every bit of variation comes from a caller-supplied seed. Violating this
 * makes a repack order-dependent in a way that would only show up as a
 * flicker in the field.
 */
import { armCrossSigma, armRidgeAngle, armRidgeCurvePoint } from './armRidgeGeometry';
import { discLightScaleLength } from '../../utils/galaxy/discLightScaleLength';
import { armCarriedFraction } from '../../utils/galaxy/armCarriedFraction';
import { warpSurfaceFrame } from '../../utils/galaxy/warpSurfaceFrame';
import { dustFaceOnColumn } from './galaxyDustMixture';
import type { GalaxyDustParams } from '../../@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldArmRecord } from '../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';
import type { GalaxyFieldTuning } from '../../@types/galaxy/GalaxyFieldTuning';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Measured lane-to-tracer offset family (150-315 pc, ~250 pc at the MW's
 * h_light 2.605 kpc — research doc s17 GAP, secondary-sourced only): as a
 * fraction of `discLightScaleLength`, 250/2605 ≈ 0.096.
 */
const OFFSET_FRACTION = 0.096;

/**
 * PHANGS lanes are a fraction of the stellar arm's own cross-section width —
 * a quarter, eyeballed against M74/NGC 628 (no primary-verified lane WIDTH
 * exists; see the design doc's "Measured anchors" GAP note). This scales
 * `armCrossSigma` down to the lane's own sigma; `armCarriedFraction` below
 * deliberately does NOT apply it — contrast `armContrast` is measured over
 * the arm's own physical footprint, not this narrower slice of it.
 */
const LANE_WIDTH_FRACTION = 0.25;

/** Young arms carry more molecular dust than old ones; the floor keeps old arms faintly laned rather than bare. */
const AGE_WEIGHT_FLOOR = 0.25;
const AGE_WEIGHT_SPAN = 0.75;

const TAU_ROOT = Math.sqrt(2 * Math.PI);

/** `armCrossSigma` only reads `.armWidthScale`; this module has no field tuning of its own to hand it. */
const ARM_WIDTH_TUNING = { armWidthScale: 1 } as GalaxyFieldTuning;

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** This arm's own age weight (0 = young gas arm, 1 = old stellar arm), floored so old arms stay faintly featured rather than bare. */
export function armAgeWeight(arm: GalaxyFieldArmRecord): number {
  return AGE_WEIGHT_FLOOR + AGE_WEIGHT_SPAN * (1 - arm.age);
}

/** The arm's true warped ridge point at a radius — mirrors `pushArmRidges`' own local `armCurvePos`. */
function ridgePointAtRadius(
  radius: number,
  geometry: GalaxyFieldGeometry,
  arm: GalaxyFieldArmRecord,
): Vec3 {
  return armRidgeCurvePoint(Math.log(radius / geometry.armStartRadius), geometry, arm);
}

export type ArmOffsetFrame = {
  readonly radius: number;
  /** This arm's ridge, offset onto the dust lane's own inner-edge track (the density-wave shock lane). */
  readonly point: Vec3;
  /** Local disc-plane normal. */
  readonly pole: Vec3;
  /** Unit tangent along the curve, increasing radius. */
  readonly along: Vec3;
  /** Unit vector across the curve, SIGNED toward the inner (shock) side — negate for the outward/inter-arm direction. */
  readonly across: Vec3;
};

/**
 * armOffsetFrameAt — the arm's warped ridge, offset onto the dust lane's own
 * inner-edge track, at one arbitrary log-radius. "Walk the SAME offset lane
 * curve" is this function, not a re-derivation of it.
 */
export function armOffsetFrameAt(
  logR: number,
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  arm: GalaxyFieldArmRecord,
): ArmOffsetFrame {
  const { armStartRadius } = geometry;
  const hLight = discLightScaleLength(geometry);
  const offsetMagnitude = OFFSET_FRACTION * hLight * dust.cloud.laneOffset;
  const radius = armStartRadius * Math.exp(logR);
  const angle = armRidgeAngle(logR, geometry, arm);
  const center = armRidgeCurvePoint(logR, geometry, arm);
  const ahead = ridgePointAtRadius(radius * 1.01, geometry, arm);
  const behind = ridgePointAtRadius(radius * 0.99, geometry, arm);
  const along = normalize3(sub3(ahead, behind));
  const pole = warpSurfaceFrame(radius, angle, geometry).pole;
  const rawAcross = normalize3(cross3(pole, along));
  // +across or -across: whichever REDUCES cylindrical radius x^2+z^2 is
  // the inner (shock) side, regardless of the arm's own winding sense.
  // The directional derivative of r^2 along `across` is
  // 2*dot(center.xz, across.xz); its sign alone decides which way is in.
  const sign = center[0] * rawAcross[0] + center[2] * rawAcross[2] > 0 ? -1 : 1;
  const across: Vec3 = [rawAcross[0] * sign, rawAcross[1] * sign, rawAcross[2] * sign];
  const point: Vec3 = [
    center[0] + across[0] * offsetMagnitude,
    center[1] + across[1] * offsetMagnitude,
    center[2] + across[2] * offsetMagnitude,
  ];
  return { radius, point, pole, along, across };
}

/**
 * armLaneWidthAndAmplitude — the lane's own across-sigma and peak tau at one
 * radius: the arm-carried share of the global column (see
 * `armCarriedFraction`'s header). `fade` is the caller's own
 * `armFadeEnvelope(radius, ...)` — passed in rather than recomputed here,
 * since callers read it at a raw event radius that doesn't necessarily sit
 * on a sampled offset curve.
 */
export function armLaneWidthAndAmplitude(
  radius: number,
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  ageWeight: number,
  fade: number,
): { readonly width: number; readonly amplitude: number } {
  const armWidth = armCrossSigma(radius, geometry, ARM_WIDTH_TUNING);
  // width feeds the amplitude normalisation below — a `laneWidth` slider
  // dragged to 0 would otherwise divide by zero instead of reading as "no
  // lane".
  const width = LANE_WIDTH_FRACTION * armWidth * dust.cloud.laneWidth;
  if (width <= 0) return { width: 0, amplitude: 0 };

  // Ledger: lane at contrast `armContrast` over an interarm occupying the
  // REST of this radius's circumference. `w` here is the arm's own physical
  // footprint (unscaled by LANE_WIDTH_FRACTION — see that constant's
  // comment), evaluated at THIS radius.
  const w = geometry.numArms * 2 * armWidth;
  const fArm = armCarriedFraction(dust.cloud.armContrast, w, 2 * Math.PI * radius);
  const laneColumn = dustFaceOnColumn(radius, geometry, dust);
  // Peak tau such that integrating the across-lane profile (~sqrt(2*PI)*
  // width, treating the super-Gaussian as Gaussian-ish for this eyeball
  // normalisation) recovers this radius's arm-carried share of the global
  // lane's column.
  const amplitude = ((fArm * laneColumn) / (TAU_ROOT * width)) * ageWeight * fade;
  return { width, amplitude };
}
