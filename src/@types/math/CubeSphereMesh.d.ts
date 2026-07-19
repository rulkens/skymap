/**
 * CubeSphereMesh — the interleaved geometry arrays for a single cube-sphere
 * FACE TILE: a grid of quads on one of the six faces of a cube, each vertex
 * projected out to unit radius so the assembled six faces tile the whole sphere
 * with no pole pinch.
 *
 * A UV sphere (see `UvSphereMesh`) crams every longitude line into a single
 * vertex at each pole, so its triangles degenerate to slivers there and the
 * texture stretches badly across the caps. The cube-sphere trades that for a
 * quasi-uniform quad grid: it starts from a cube, subdivides each face into a
 * regular grid, and NORMALIZES every grid point onto the unit sphere. Triangle
 * areas stay within a small factor of each other everywhere — no pole is
 * special — which is exactly what a terrain quadtree (Plan C) wants when it
 * subdivides one tile without the rest of the sphere caring.
 *
 * The parameterisation stays equirectangular so the SAME Blue Marble texture
 * the UV sphere used still maps: `u = lon/2π`, `v = lat/π + 0.5`, with lon/lat
 * derived from the normalized position in the shared equatorial J2000 frame.
 *
 * Winding: indices are ordered counter-clockwise (CCW) as seen from OUTSIDE the
 * sphere, matching WebGPU's default front face (`frontFace:'ccw'` +
 * `cullMode:'back'`) — identical to `UvSphereMesh`, so the renderer is unchanged.
 *
 * `tangents` carry the unit east direction (increasing longitude) per vertex,
 * the surface basis a tangent-space normal map (Plan C) is expressed against;
 * `bitangent = cross(normal, tangent)` is recovered on demand.
 */

export type CubeSphereMesh = {
  readonly positions: Float32Array; // 3 per vertex, UNIT radius, J2000 frame
  readonly uvs: Float32Array; // 2 per vertex, equirectangular (u=lon/2π, v=lat/π+0.5)
  readonly indices: Uint32Array; // triangle list, CCW = outward-facing
  readonly tangents: Float32Array; // 3 per vertex, unit local-space +u (east) direction
};
