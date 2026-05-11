/**
 * Vec2/Vec3/Vec4 — flat, readonly, number-tuple aliases for the small
 * vectors that show up everywhere in renderer code (positions, colors,
 * sizes, screen coords).  Defined as `readonly` tuples so callers
 * cannot mutate a value they don't own; pass a mutable array if you
 * really need to write back.
 *
 * These are the only vector tuple types in the project.  Prefer them
 * over inline `readonly [number, number, ...]` so every site speaks
 * the same language and a search for `Vec3` finds them all.
 */

/** Two-element vector, e.g. screen-space size or 2D coord. */
export type Vec2 = readonly [number, number];

/** Three-element vector, e.g. world position, RGB color, axis. */
export type Vec3 = readonly [number, number, number];

/** Four-element vector, e.g. RGBA color, quaternion (x, y, z, w). */
export type Vec4 = readonly [number, number, number, number];
