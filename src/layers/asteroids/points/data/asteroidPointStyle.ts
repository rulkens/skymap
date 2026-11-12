/**
 * The dots' half-extents in px. A 1.5 px target can't be hit with a mouse, so the pick is wider; the
 * selected dot is wider still, or it sinks into its own orbit ring, drawn through it in the same tint.
 * Sized by H, a dot keeps `dotRadiusPx` fainter than `sizeKneeH` and grows as t² to `sizeMaxScale` at
 * `sizeFullH` (Pallas, the brightest row drawn as a dot: Ceres and Vesta are meshes), so only the
 * few largest bodies stand out from the field. Every row but `pickRadiusPx` and `sizeFullH` is a
 * DebugPanel "Asteroid tuning" row.
 */
export const ASTEROID_POINT_STYLE = {
  dotRadiusPx: 1.4,
  pickRadiusPx: 6,
  selectedRadiusPx: 8,
  sizeKneeH: 12,
  sizeMaxScale: 2.5,
  sizeFullH: 4,
} as const;
