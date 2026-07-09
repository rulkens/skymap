/**
 * UvSphereMesh — the interleaved geometry arrays for a triangulated UV sphere
 * centred at the origin with unit radius.
 *
 * A UV sphere subdivides the surface along lines of latitude (rings) and
 * longitude (segments), producing a regular grid of quads each split into
 * two triangles. The topology is predictable and the parameterisation is
 * equirectangular, which makes it the natural choice for any spherical body
 * that carries a lat/lon texture — in particular the Blue Marble imagery
 * used by the Earth renderer in Plan 02. Alternatives like icospheres give
 * more uniform triangle areas but irregular UVs; geodesic spheres are
 * similar. For texture-mapped planetary bodies, UV sphere wins.
 *
 * Winding convention: indices are ordered counter-clockwise (CCW) when
 * viewed from outside the sphere, so the geometric normal of every triangle
 * points outward. WebGPU's default front-face is CCW, so no back-face
 * correction is needed for the standard exterior render.
 */

export type UvSphereMesh = {
  readonly positions: Float32Array; // 3 per vertex, UNIT radius, centred at origin
  readonly uvs: Float32Array;       // 2 per vertex, equirectangular (u=lon/2π, v=lat/π)
  readonly indices: Uint16Array;    // triangle list, CCW = outward-facing
};
