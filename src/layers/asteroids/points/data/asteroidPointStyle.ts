/**
 * The dots' half-extents in px. A 1.5 px target can't be hit with a mouse, so the pick is wider; the
 * selected dot is wider still, or it sinks into its own orbit ring, drawn through it in the same tint.
 */
export const ASTEROID_POINT_STYLE = {
  dotRadiusPx: 1.25,
  pickRadiusPx: 6,
  selectedRadiusPx: 8,
} as const;
