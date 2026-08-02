/**
 * The arm dust lane's shared geometry and ledger: how wide it is and how
 * much of the global column it carries at a radius
 * (`armLaneWidthAndAmplitude`), and how strongly an arm's age weights it
 * (`armAgeWeight`). `dustBubblePlacements.ts` and `clusteredDiscPlacement.ts`
 * place themselves on these rather than re-deriving the ledger.
 *
 * PURITY INVARIANT: no reads of engine/render state, no Date/Math.random —
 * every bit of variation comes from a caller-supplied seed. Violating this
 * makes a repack order-dependent in a way that would only show up as a
 * flicker in the field.
 */
import { armCrossSigma } from './armRidgeGeometry';
import { armCarriedFraction } from '../../utils/galaxy/armCarriedFraction';
import { dustFaceOnColumn } from './galaxyDustMixture';
import type { GalaxyDustParams } from '../../@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldArmRecord } from '../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';
import type { GalaxyFieldTuning } from '../../@types/galaxy/GalaxyFieldTuning';

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

/** This arm's own age weight (0 = young gas arm, 1 = old stellar arm), floored so old arms stay faintly featured rather than bare. */
export function armAgeWeight(arm: GalaxyFieldArmRecord): number {
  return AGE_WEIGHT_FLOOR + AGE_WEIGHT_SPAN * (1 - arm.age);
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
