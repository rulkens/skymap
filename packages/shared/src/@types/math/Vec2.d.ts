/**
 * Vec2/Vec3/Vec4 — flat number-tuple aliases for the small vectors that
 * show up everywhere in renderer code (positions, colors, sizes, screen
 * coords).
 *
 * These tuples are MUTABLE by default.  That matches gl-matrix's `vec3`
 * (a plain `Float32Array` that callers freely write into) and reflects
 * the codebase's reality: factories return mutable tuples, and a few
 * hot paths write back into them in
 * place.  Functions that promise not to mutate their input should
 * annotate the parameter as `Readonly<Vec3>` — this gives one shared
 * storage type and lets read-only-ness be a per-boundary decision
 * rather than a property of the alias itself.
 *
 * These are the only vector tuple types in the project.  Prefer them
 * over inline `[number, number, ...]` so every site speaks the same
 * language and a search for `Vec3` finds them all.
 */

/** Two-element vector, e.g. screen-space size or 2D coord. */
export type Vec2 = [number, number];
