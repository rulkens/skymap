/**
 * AnnulusMesh — the geometry arrays for a triangulated flat annulus (a ring)
 * centred at the origin in the local z = 0 plane, with a UNIT outer radius.
 *
 * The sibling of `UvSphereMesh` for the one non-spherical body the scene draws:
 * Saturn's rings. An annulus is two concentric vertex rings — an inner circle
 * at `innerRatio` and an outer circle at radius 1 — with the quad between each
 * adjacent pair of segments split into two triangles. Building it at unit outer
 * radius lets the same `composeBodyMvp` model scale (ring OUTER radius → Mpc)
 * that a sphere renderer uses place it in world space by construction.
 *
 * The parameterisation is RADIAL: `uvs` carries `u = normalized radius`
 * (inner edge → 0, outer edge → 1) so a consumer can sample a radial alpha
 * strip across the ring's width. `v` is a fixed 0.5 — the strip is a single-row
 * N×1 texture, so only `u` varies. (The ring renderer itself derives the same
 * normalized radius per-draw from the ring's inner ratio rather than binding
 * these uvs, because its geometry is a ring-agnostic disc; the uvs are the
 * general contract a concrete-annulus consumer would read.)
 *
 * Winding: the triangles are wound CCW as seen from +z (the local pole side),
 * but the ring is drawn two-sided (`cullMode: 'none'`), so the winding is not
 * load-bearing for culling — a thin ring is lit on whichever face the sun
 * strikes.
 */

export type AnnulusMesh = {
  readonly positions: Float32Array; // 3 per vertex, z = 0, outer radius = 1
  readonly uvs: Float32Array;       // 2 per vertex, u = normalized radius, v = 0.5
  readonly indices: Uint16Array;    // triangle list
};
