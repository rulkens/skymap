/**
 * Vec4 — four-element flat number-tuple, mutable by default.  Used for
 * RGBA color, quaternions (x, y, z, w), and any 4-component renderer
 * value where mutation in place matters (gl-matrix's `quat`, the
 * texture-atlas slot rectangle).
 *
 * Functions that promise not to mutate their input take `Readonly<Vec4>`
 * at the boundary — the alias itself stays plain so gl-matrix interop
 * doesn't need a cast.
 */

/** Four-element vector, e.g. RGBA color, quaternion (x, y, z, w). */
export type Vec4 = [number, number, number, number];
