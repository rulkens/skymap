/**
 * AntiqueReliefBody — how the relief pass (`antiqueLook/relief.wesl`) engraves one body's
 * ground: what its height model resolves, how much its slopes are steepened, and whether
 * lit slopes take ink at all.
 */

export type AntiqueReliefBody = {
  /** The finest height model's cell, m: a slope across fewer metres is a mesh facet. */
  readonly cellM: number;
  /** Vertical exaggeration of the shading normal on the ground and from orbit (Imhof). */
  readonly exaggeration: readonly [ground: number, orbit: number];
  /** What the stroke share measures: 1 the landform's slope alone, the plate inking it by
   * the plain render's shade (Mars); 0 the plate light's shade side only (Earth). */
  readonly slopeInk: number;
  /** Difference the depth normal across one height cell on screen, so a coarse mesh's
   * facets average out instead of printing one tone each. */
  readonly wideNormal: boolean;
  /** The antique map's reveal level (`antiqueMapDetail`) over which the hachures fade in,
   * as the map's molehill signs fade out; null: always in. */
  readonly revealDetail: readonly [number, number] | null;
};
