/**
 * uvSphereMesh — build a unit UV sphere with equirectangular texture coordinates.
 *
 * A UV sphere divides the surface into a latitude–longitude grid: `rings` bands
 * from south pole to north pole and `segments` slices around the equator. Each
 * quad cell in the grid becomes two CCW triangles. The vertex count is
 * `(rings+1) * (segments+1)` — one extra ring for the cap parallels and one
 * extra segment so the seam column has vertices at both u=0 and u=1 with the
 * same 3D position but distinct UVs (required for correct texture wrapping).
 *
 * UV mapping is equirectangular:
 *   u = longitude / (2π)   → [0, 1] west-to-east
 *   v = latitude  / π + 0.5 → [0, 1] south-to-north
 * This matches the projection used by NASA Blue Marble imagery and most
 * spherical maps, so the Earth/planet renderer in Plan 02 can sample without
 * any remapping.
 *
 * Winding: for each quad (ring r, segment s), the two triangles are wound CCW
 * when viewed from outside the sphere — the GPU front-face default — so normals
 * point outward and back-face culling works without inversion.
 */

import type { UvSphereMesh } from '../../@types/math/UvSphereMesh';

export function uvSphereMesh(segments: number, rings: number): UvSphereMesh {
  const vertexCount = (rings + 1) * (segments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  // Build vertex grid: iterate ring (latitude) then segment (longitude).
  // Ring 0 = south pole (v=0, lat=-π/2), ring `rings` = north pole (v=1, lat=+π/2).
  let vi = 0;
  let ui = 0;
  for (let r = 0; r <= rings; r++) {
    // latitude: -π/2 (south) → +π/2 (north)
    const lat = Math.PI * (r / rings - 0.5);
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const v = r / rings; // [0,1] south-to-north

    for (let s = 0; s <= segments; s++) {
      // longitude: 0 → 2π, with the seam vertex duplicated (s==segments shares
      // world position with s==0 but carries u=1 instead of u=0)
      const lon = (2 * Math.PI * s) / segments;
      const cosLon = Math.cos(lon);
      const sinLon = Math.sin(lon);
      const u = s / segments; // [0,1] west-to-east

      // Unit-sphere position in right-handed Y-up coordinates:
      //   x = cos(lat)*cos(lon),  y = sin(lat),  z = cos(lat)*sin(lon)
      // Y-up is the renderer's world-space convention; the equatorial plane is XZ.
      positions[vi++] = cosLat * cosLon; // x
      positions[vi++] = sinLat;           // y (north pole = +Y)
      positions[vi++] = cosLat * sinLon; // z

      uvs[ui++] = u;
      uvs[ui++] = v;
    }
  }

  // Build index list: two CCW triangles per quad cell.
  // For ring r and segment s, the four corner indices are:
  //   a = r*(segments+1) + s          (bottom-left)
  //   b = (r+1)*(segments+1) + s      (top-left)
  //   c = (r+1)*(segments+1) + s+1    (top-right)
  //   d = r*(segments+1) + s+1        (bottom-right)
  //
  // CCW outward winding (viewed from outside):
  //   triangle 1: a, b, c  — left half of quad, going CCW
  //   triangle 2: a, c, d  — right half of quad, going CCW
  const indexCount = segments * rings * 6;
  const indices = new Uint16Array(indexCount);
  let ii = 0;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * (segments + 1) + s;
      const b = (r + 1) * (segments + 1) + s;
      const c = (r + 1) * (segments + 1) + s + 1;
      const d = r * (segments + 1) + s + 1;

      // Triangle 1 (CCW outward)
      indices[ii++] = a;
      indices[ii++] = b;
      indices[ii++] = c;

      // Triangle 2 (CCW outward)
      indices[ii++] = a;
      indices[ii++] = c;
      indices[ii++] = d;
    }
  }

  return { positions, uvs, indices };
}
