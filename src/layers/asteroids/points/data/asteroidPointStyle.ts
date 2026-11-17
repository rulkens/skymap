/**
 * The dots' fixed shape rows; the tuned ones are per class in `ASTEROID_CLASS_LOOK`. A 1.5 px target
 * can't be hit with a mouse, so the pick is wider. `sizeFullH` is where a dot sized by H reaches its
 * class's max scale: Pallas, the brightest row drawn as a dot (Ceres and Vesta are meshes).
 */
export const ASTEROID_POINT_STYLE = {
  pickRadiusPx: 6,
  sizeFullH: 4,
} as const;
