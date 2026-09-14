/**
 * BodySurface — a body's ground: the datum sphere heights are defined against,
 * plus the signed metres the real surface spans against it.
 *
 * Relief is an interval, not a scalar, because its readers round in opposite
 * directions — an extent wants the highest peak, an occluder the deepest basin
 * — so no one number is safe for both (spec §8.3). The two bounds are derived
 * at the read site (`outerBoundRadiusM` / `innerBoundRadiusM`), never stored.
 */

export type BodySurface = {
  readonly datumRadiusM: number; // metres; tiles and heights are defined against this sphere
  /**
   * [min, max] metres against the datum. `[0, 0]` for every body in P1 — a
   * placeholder until F1 compiles each body's real extremes from its compiled
   * height grid (spec §3.4e).
   */
  readonly reliefM: readonly [number, number];
};
