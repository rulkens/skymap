/**
 * RENDER_ORIGIN_MPC — the single Megaparsec point all per-object
 * coordinate matrices are expressed relative to.
 *
 * In a traditional 3D renderer, world coordinates live in a global
 * space shared by all drawable objects — a camera orbits around a single
 * origin and interprets all positions relative to it. For a multi-scale
 * system like skymap (Sun at the center, Megaparsec-scale structures at
 * distance), a moving origin lets the camera stay near the scene's
 * focal point while object positions remain well-conditioned (no large
 * numbers that lose floating-point precision).
 *
 * For the "zoom to Earth" feature, the origin is fixed at the Sun
 * (the starting point of the camera; local-volume galaxies are all
 * within ~100 Mpc). A future implementation may introduce a dynamic
 * origin that adjusts as the camera pans far from the Sun, preserving
 * numerical stability across the full depth of the catalog; that
 * customization point lives here.
 *
 * All galaxy positions in the renderer are Mpc offsets from this origin.
 * All camera pose (lookAt, up, position) is expressed in the same frame.
 */

import type { Vec3 } from '../@types/math/Vec3';

/** The Sun's galactic coordinates in Megaparsecs (origin of the coordinate frame). */
export const RENDER_ORIGIN_MPC: Readonly<Vec3> = [0, 0, 0];
