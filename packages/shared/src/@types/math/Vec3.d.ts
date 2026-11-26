/**
 * Vec3 — three-element flat number-tuple used pervasively in renderer
 * code (world positions, RGB color, axis directions).
 *
 * Mutable by default to match gl-matrix's `vec3` (a `Float32Array`
 * callers freely write into) and the codebase's hot paths
 * that mutate in place.  Functions that promise
 * not to mutate take `Readonly<Vec3>` at the boundary instead of
 * branding the alias itself.
 *
 * Prefer this over inline `[number, number, number]` so every site
 * speaks the same language and a search for `Vec3` finds them all.
 */

/** Three-element vector, e.g. world position, RGB color, axis. */
export type Vec3 = [number, number, number];
