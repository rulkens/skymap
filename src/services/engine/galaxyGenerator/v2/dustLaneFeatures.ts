/**
 * How strongly an arm's age weights the dust it carries (`armAgeWeight`).
 * `clusteredDiscPlacement.ts` places itself on this rather than re-deriving it.
 *
 * PURITY INVARIANT: no reads of engine/render state, no Date/Math.random —
 * every bit of variation comes from a caller-supplied seed. Violating this
 * makes a repack order-dependent in a way that would only show up as a
 * flicker in the field.
 */
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';

/** Young arms carry more molecular dust than old ones; the floor keeps old arms faintly laned rather than bare. */
const AGE_WEIGHT_FLOOR = 0.25;
const AGE_WEIGHT_SPAN = 0.75;

/** 0 = young gas arm, 1 = old stellar arm. */
export function armAgeWeight(arm: GalaxyFieldArmRecord): number {
  return AGE_WEIGHT_FLOOR + AGE_WEIGHT_SPAN * (1 - arm.age);
}
