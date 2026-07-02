/**
 * GeneratedGalaxy — the output of `generateGalaxy`: two flat, tightly-packed
 * Float32Arrays ready to hand straight to a GPU vertex buffer, plus their
 * element counts (the arrays are laid out at their exact filled length, so
 * `stars.length / 8 === starCount` always holds — the counts are carried
 * alongside rather than derived, matching how the writers below expose
 * `count()`).
 */

export type GeneratedGalaxy = {
  /** [x, y, z, r, g, b, size, brightness] × starCount (stride 8). */
  readonly stars: Float32Array;
  readonly starCount: number;
  /** [x, y, z, size, r, g, b, opacity] × dustCount (stride 8). */
  readonly dust: Float32Array;
  readonly dustCount: number;
};
