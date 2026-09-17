import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Sparse end of the density tint ramp (RGB). Luminance-matched to
 * `FILAMENT_HOT_TINT` on purpose, so the sparse → dense shift reads as colour,
 * not glare.
 */
export const FILAMENT_BASE_TINT: Vec3 = [0.55, 0.45, 0.85];
