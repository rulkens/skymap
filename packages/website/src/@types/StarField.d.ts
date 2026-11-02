import type { StarFieldLayer } from './StarFieldLayer';

/**
 * The naked-eye sky the pages lie on, as tools/site/buildStarField.ts bakes it: one band round a great circle,
 * one star per index of the arrays, grouped by distance layer, nearest first.
 */
export type StarField = {
  layers: readonly StarFieldLayer[];
  /** sRGB '#rrggbb' per tint index: the app's own star colours. */
  palette: readonly string[];
  /** Degrees along the band, southward from the page top's centre, 0 to 360. */
  along: Float32Array;
  /** Mercator ordinate across the band in degrees, east positive. */
  across: Float32Array;
  /** Hipparcos magnitude Hp. */
  mag: Float32Array;
  tint: Uint8Array;
};
