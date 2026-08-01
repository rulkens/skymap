/**
 * armCarriedFraction — what share of a ring's dust sits in an arm-contrast
 * lane rather than the smooth interarm background, given the lane occupies
 * `laneWidth` of the ring's `circumference` at contrast `contrast` over the
 * interarm floor: a length-weighted mix, `contrast*laneWidth` against the
 * interarm's `circumference - laneWidth` (floored at `laneWidth` itself so a
 * lane wider than the ring's own remaining interarm can't push the fraction
 * past what a length-weighted mix means). Shared by `dustLaneFeatures.ts`
 * (evaluated per segment, at that segment's own radius) and
 * `galaxyDustMixture.ts`'s `armCarriedDustFraction` (one radius-averaged
 * call) — same formula, different radius.
 */
export function armCarriedFraction(
  contrast: number,
  laneWidth: number,
  circumference: number,
): number {
  const interarm = Math.max(circumference - laneWidth, laneWidth);
  return (contrast * laneWidth) / (contrast * laneWidth + interarm);
}
