/**
 * uvSphereMesh — build a unit UV sphere with equirectangular texture coordinates.
 *
 * A UV sphere divides the surface into a latitude–longitude grid: `rings` bands
 * from south pole to north pole and `segments` slices around the equator. Each
 * quad cell in the grid becomes two triangles. The vertex count is
 * `(rings+1) * (segments+1)` — one extra ring for the cap parallels and one
 * extra segment so the seam column has vertices at both u=0 and u=1 with the
 * same 3D position but distinct UVs (required for correct texture wrapping).
 *
 * ## Axes — equatorial J2000, shared with the catalog
 *
 * The mesh is built in the SAME right-handed equatorial J2000 frame the galaxy
 * catalogs use (see `raDecDistToCartesian`): +x → (RA 0°, Dec 0°, the vernal
 * equinox direction), +y → (RA 90°, Dec 0°), +z → Dec +90° (the celestial
 * north pole). Mesh latitude is Declination and mesh longitude is Right
 * Ascension, so an UNTRANSFORMED unit sphere already IS a celestial globe: its
 * pole is the frame's z-axis by construction. A body drawn with this mesh and
 * no rotation therefore has its spin axis along +z — which is exactly what an
 * equatorial frame means. Earth's 23.4° tilt relative to the ecliptic is then
 * the frame relationship itself, not a rotation this mesh has to apply.
 *
 * The mesh's own longitude origin (lon 0) sits along +x; each body's IAU
 * rotation (`rotationFromIau`) then swings that meridian to where the body's
 * prime meridian actually points, so lon 0 IS the body's prime meridian.
 * Longitude winds x→y (eastward, CCW seen from above the north pole) — matching
 * both increasing RA and a prograde body's real eastward spin.
 *
 *   x = cos(lat)·cos(lon)   (lat = Dec, lon = RA)
 *   y = cos(lat)·sin(lon)
 *   z = sin(lat)            (north pole = +z)
 *
 * UV mapping is equirectangular:
 *   u = longitude / (2π) + TEXTURE_PRIME_MERIDIAN_U → [0.5, 1.5] west-to-east
 *   v = latitude  / π + 0.5                          → [0, 1] south-to-north
 *
 * ## Registering the map on the prime meridian
 *
 * `TEXTURE_PRIME_MERIDIAN_U` is what makes lon 0 sample the map's CENTRE column,
 * where every standard planetary map paints longitude 0. Without it the map's
 * antimeridian lands on the prime meridian and the whole surface reads 180° round
 * — the Moon, tidally locked with its prime meridian aimed at Earth, showing its
 * FAR side. `cubeSphereMesh` (Earth's) bakes the same offset from the same
 * constant, so both meshes register identically.
 *
 * The offset is NOT wrapped back into [0, 1]: u runs 0.5 → 1.5 monotonically and
 * the samplers address u as `repeat`, so the hardware does the wrap. Wrapping
 * here instead would jump u by a whole turn mid-sphere, and that discontinuity
 * breaks the fragment quad's derivatives at the seam — forcing the coarsest mip
 * along a ~1 px antimeridian line.
 *
 * ## Winding
 *
 * Each quad's two triangles are wound CCW as seen from OUTSIDE the sphere — the
 * GPU front-face default (`frontFace: 'ccw'` + `cullMode: 'back'`) — so normals
 * point outward and back faces are culled. The index order below winds the
 * corners a→c→b (not the naive a→b→c): with longitude on the +y axis the ring
 * order circles the pole the opposite way than it would in a y-up basis, so the
 * a→b→c order that is CCW-outward with y-up is CW-outward here. Reversing to
 * a→c→b restores the outward normal. See the per-quad comment for the layout.
 */

import { TEXTURE_PRIME_MERIDIAN_U } from '../../data/bodies/texturePrimeMeridianU';
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
      // [0.5, 1.5] west-to-east: the map's centre column registers on lon 0 (the
      // body's prime meridian), and the turn is left unwrapped for the sampler's
      // `repeat` addressing to close — see the module header.
      const u = s / segments + TEXTURE_PRIME_MERIDIAN_U;

      // Unit-sphere position in the equatorial J2000 frame (see module header):
      //   x = cos(lat)*cos(lon),  y = cos(lat)*sin(lon),  z = sin(lat)
      // lat = Declination, lon = Right Ascension; the equatorial plane is XY and
      // the pole is +z, so an untransformed sphere is already a celestial globe.
      positions[vi++] = cosLat * cosLon; // x
      positions[vi++] = cosLat * sinLon; // y
      positions[vi++] = sinLat; // z (north pole = +z)

      uvs[ui++] = u;
      uvs[ui++] = v;
    }
  }

  // Build index list: two CCW-outward triangles per quad cell.
  // For ring r and segment s, the four corner indices are:
  //   a = r*(segments+1) + s          (bottom-left,  ring r,   seg s)
  //   b = (r+1)*(segments+1) + s      (top-left,     ring r+1, seg s)
  //   c = (r+1)*(segments+1) + s+1    (top-right,    ring r+1, seg s+1)
  //   d = r*(segments+1) + s+1        (bottom-right, ring r,   seg s+1)
  //
  // Winding runs a→c→b and a→d→c. That is CCW as viewed from OUTSIDE the sphere
  // in this frame's axes: with longitude on +y the ring order circles the pole
  // the opposite way than in a y-up basis, so the corners are wound a→c→b (the
  // reverse of the naive a→b→c) to keep the geometric normal pointing outward.
  const indexCount = segments * rings * 6;
  const indices = new Uint16Array(indexCount);
  let ii = 0;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * (segments + 1) + s;
      const b = (r + 1) * (segments + 1) + s;
      const c = (r + 1) * (segments + 1) + s + 1;
      const d = r * (segments + 1) + s + 1;

      // Triangle 1 (CCW outward): a, c, b
      indices[ii++] = a;
      indices[ii++] = c;
      indices[ii++] = b;

      // Triangle 2 (CCW outward): a, d, c
      indices[ii++] = a;
      indices[ii++] = d;
      indices[ii++] = c;
    }
  }

  return { positions, uvs, indices };
}
