/**
 * cubeSphereMesh — build one FACE TILE of a cube-sphere: a regular quad grid on
 * one of six cube faces, every grid point normalized onto the unit sphere.
 *
 * ## Why a cube-sphere, not a UV sphere
 *
 * `uvSphereMesh` collapses all longitudes into a single vertex at each pole, so
 * its cap triangles degenerate and the equirectangular texture smears across the
 * poles. A cube-sphere avoids that: take a cube, subdivide each face into an
 * `resolution × resolution` grid, and NORMALIZE every grid point out to radius
 * 1. The result covers the sphere with near-uniform quads and no singular pole
 * — the coordinate system a terrain quadtree (Plan C) subdivides one tile at a
 * time without disturbing the rest of the globe.
 *
 * ## Forward-compat coordinate: (face, level, tileX, tileY)
 *
 * A face's surface is the parameter square `[0,1]²`. At `level` L that square is
 * cut into a `2^L × 2^L` grid of tiles; `(tileX, tileY)` selects one, spanning
 * `[tileX/2^L … (tileX+1)/2^L]` in each axis. This whole function builds exactly
 * one such tile. Today only `level 0` (the whole face, `tileX = tileY = 0`) is
 * used, but the parameters exist so the future quadtree subdivides WITHOUT a
 * signature change — the load-bearing part of the design (spec §4). We do the
 * sub-rectangle arithmetic but build no quadtree machinery.
 *
 * ## Frame + winding parity with uvSphereMesh
 *
 * Positions live in the SAME equatorial J2000 frame the galaxy catalogs and the
 * UV sphere use: +x = (RA 0°, Dec 0°), +y = (RA 90°), +z = celestial north.
 * lon = atan2(y, x) is Right Ascension, lat = asin(z) is Declination, and the
 * texture map is the equirectangular convention, with the prime meridian at the
 * image CENTRE (u=0.5) to match how standard planetary maps are authored:
 *
 *   u = lon / (2π) + 0.5  → west-to-east, lon 0 (prime meridian) at u=0.5
 *   v = lat /  π + 0.5     → south-to-north
 *
 * The +0.5 registers the map's centre (geographic longitude 0) onto the local +x
 * axis the IAU rotation aims a body's prime meridian at, so the painted geography
 * sits under the physically-lit hemisphere (see the per-vertex note below). The
 * Blue Marble bitmap and the renderer's `flipY:true` / CCW /
 * `cullMode:'back'` all stay unchanged from the UV-sphere era. Each face's two
 * in-plane axes are chosen so `sAxis × tAxis = outwardNormal`; with that, the
 * (i,j)→(i+1,j)→(i,j+1) triangle order is automatically CCW-outward on every
 * face — no per-face winding flip.
 *
 * ## Seam continuity — locally-continuous u per triangle
 *
 * atan2 has a branch cut at lon = ±π, and worse, every pole face wraps a full
 * 2π of longitude around its centre, so a single global `u` field cannot be
 * continuous across a whole face. Left raw, a triangle straddling the cut would
 * interpolate u the "long way" round (e.g. 0.98 → 0.02 read as a 0.96-wide
 * sweep), smearing the entire texture width across those triangles.
 *
 * The fix is per-triangle and face-agnostic: for each triangle we shift the
 * offending vertices' u by whole turns so all three land inside one ≤0.5-wide
 * window (`windowShifts`), duplicating the vertex when a shift is needed (the
 * same position/tangent, a `u ± 1` copy — the sampler's `addressModeU:'repeat'`
 * makes u slightly <0 or >1 wrap correctly). This is the mesh analogue of the
 * UV sphere's duplicated seam column, generalised to the diagonal branch cuts a
 * cube-sphere has. Pole cells legitimately reach a 0.5 window; only a genuine
 * wrap bug reaches ~1.0.
 *
 * ## Tangents
 *
 * The tangent is the unit east direction (increasing longitude). Differentiating
 * position = (cosLat·cosLon, cosLat·sinLon, sinLat) w.r.t. lon and normalizing
 * gives (-sinLon, cosLon, 0) — independent of latitude, already unit length, and
 * always perpendicular to the radial normal. At a pole vertex lon is arbitrary
 * (atan2(0,0) = 0), but (-sin0, cos0, 0) = (0,1,0) is still a valid unit
 * east-vector ⟂ to the pole axis, so the formula needs no pole special-case.
 * `bitangent = cross(normal, tangent)` is left for Plan C's normal-map sampling.
 */

import type { CubeSphereMesh } from '../../@types/math/CubeSphereMesh';
import type { Vec3 } from '../../@types/math/Vec3';
import { TEXTURE_PRIME_MERIDIAN_U } from '../../data/bodies/texturePrimeMeridianU';

// Six cube faces (index 0..5 = +x, -x, +y, -y, +z, -z). Each carries its outward
// normal and two in-plane axes chosen so sAxis × tAxis = normal — which makes the
// (i,j)→(i+1,j)→(i,j+1) triangle order CCW as seen from outside, on every face.
// The axes are constants read but never mutated, so `Readonly<Vec3>` at the field.
type Face = { normal: Readonly<Vec3>; sAxis: Readonly<Vec3>; tAxis: Readonly<Vec3> };

const FACES: readonly Face[] = [
  { normal: [1, 0, 0], sAxis: [0, 1, 0], tAxis: [0, 0, 1] }, // +x:  y × z =  x
  { normal: [-1, 0, 0], sAxis: [0, 0, 1], tAxis: [0, 1, 0] }, // -x:  z × y = -x
  { normal: [0, 1, 0], sAxis: [0, 0, 1], tAxis: [1, 0, 0] }, // +y:  z × x =  y
  { normal: [0, -1, 0], sAxis: [1, 0, 0], tAxis: [0, 0, 1] }, // -y:  x × z = -y
  { normal: [0, 0, 1], sAxis: [1, 0, 0], tAxis: [0, 1, 0] }, // +z:  x × y =  z
  { normal: [0, 0, -1], sAxis: [0, 1, 0], tAxis: [1, 0, 0] }, // -z:  y × x = -z
];

// Integer whole-turn shifts (added to each vertex's base u) that pull a
// triangle's three u values into a single ≤0.5-wide window. Non-straddling
// triangles get [0,0,0]; a seam-crossing triangle lifts its low-side vertices by
// +1 so they align with the high side. Converges in ≤2 passes for 3 points.
function windowShifts(u0: number, u1: number, u2: number): [number, number, number] {
  const u: [number, number, number] = [u0, u1, u2];
  const s: [number, number, number] = [0, 0, 0];
  for (let pass = 0; pass < 3; pass++) {
    const cur: [number, number, number] = [u[0] + s[0], u[1] + s[1], u[2] + s[2]];
    const m = Math.max(cur[0], cur[1], cur[2]);
    let changed = false;
    for (let k = 0; k < 3; k++) {
      if (m - (cur[k] as number) > 0.5) {
        s[k] = (s[k] as number) + 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return s;
}

export function cubeSphereMesh(
  face: number,
  level: number,
  tileX: number,
  tileY: number,
  resolution: number,
): CubeSphereMesh {
  const f = FACES[face] as Face;
  const tileScale = 1 / 2 ** level; // width of this tile in the face's [0,1] square
  const row = resolution + 1;

  // Grow-able backing arrays: the base grid is (resolution+1)² vertices; seam
  // duplication appends a handful more.
  const positions: number[] = [];
  const uvs: number[] = [];
  const tangents: number[] = [];

  for (let j = 0; j <= resolution; j++) {
    // v-parameter within the face's [0,1] square, then remapped to cube face [-1,1]
    const gv = (tileY + j / resolution) * tileScale;
    const b = 2 * gv - 1;
    for (let i = 0; i <= resolution; i++) {
      const gu = (tileX + i / resolution) * tileScale;
      const a = 2 * gu - 1;

      // Cube-face point (on the plane of the face), then projected to the sphere.
      const cx = f.normal[0] + a * f.sAxis[0] + b * f.tAxis[0];
      const cy = f.normal[1] + a * f.sAxis[1] + b * f.tAxis[1];
      const cz = f.normal[2] + a * f.sAxis[2] + b * f.tAxis[2];
      const inv = 1 / Math.hypot(cx, cy, cz);
      const x = cx * inv;
      const y = cy * inv;
      const z = cz * inv;
      positions.push(x, y, z);

      const lon = Math.atan2(y, x); // Right Ascension,  (-π, π]
      const lat = Math.asin(Math.max(-1, Math.min(1, z))); // Declination, [-π/2, π/2]
      // Base u in [0,1); per-triangle shifts restore continuity across the seam
      // below. TEXTURE_PRIME_MERIDIAN_U puts the PRIME MERIDIAN (lon 0, the
      // local +x the IAU rotation orients Earth's Greenwich to) at u=0.5 — the
      // image CENTRE, where every standard equirectangular planetary map (Blue
      // Marble and the rest) paints geographic longitude 0. Without it a raw
      // u=lon/2π lands the map's ANTIMERIDIAN on +x, rotating the whole surface
      // 180° about the pole: the continents ride the wrong hemisphere and Earth's
      // day/night terminator reads inverted against a live clock (mid-afternoon
      // Europe shown in night). The seam (u wrap) moves to lon=±π accordingly;
      // windowShifts re-continuizes it per triangle wherever it lands, and the
      // +u=east tangent below is unchanged. `uvSphereMesh` bakes the same offset
      // for every other body; the one shader site that re-encodes it (it can't
      // import a TS constant) is named in the constant's docblock.
      let u = lon / (2 * Math.PI) + TEXTURE_PRIME_MERIDIAN_U;
      u = u - Math.floor(u);
      const v = lat / Math.PI + 0.5;
      uvs.push(u, v);

      // Unit east tangent (increasing longitude); latitude-independent.
      tangents.push(-Math.sin(lon), Math.cos(lon), 0);
    }
  }

  const indices: number[] = [];
  // Cache duplicated seam vertices so triangles sharing a shifted vertex reuse it.
  // Key packs (originalIndex, shift); shift is small (0..2).
  const dupCache = new Map<number, number>();

  const shiftedIndex = (idx: number, shift: number): number => {
    if (shift === 0) return idx;
    const key = idx * 8 + shift;
    const cached = dupCache.get(key);
    if (cached !== undefined) return cached;
    const ni = positions.length / 3;
    positions.push(
      positions[idx * 3] as number,
      positions[idx * 3 + 1] as number,
      positions[idx * 3 + 2] as number,
    );
    uvs.push((uvs[idx * 2] as number) + shift, uvs[idx * 2 + 1] as number);
    tangents.push(
      tangents[idx * 3] as number,
      tangents[idx * 3 + 1] as number,
      tangents[idx * 3 + 2] as number,
    );
    dupCache.set(key, ni);
    return ni;
  };

  const emitTriangle = (ia: number, ib: number, ic: number): void => {
    const [sa, sb, sc] = windowShifts(
      uvs[ia * 2] as number,
      uvs[ib * 2] as number,
      uvs[ic * 2] as number,
    );
    // Preserve corner ORDER (ia, ib, ic) so the CCW-outward winding is unchanged;
    // only substitute a u-shifted duplicate where a seam shift is required.
    indices.push(shiftedIndex(ia, sa), shiftedIndex(ib, sb), shiftedIndex(ic, sc));
  };

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const p00 = j * row + i;
      const p10 = j * row + i + 1;
      const p01 = (j + 1) * row + i;
      const p11 = (j + 1) * row + i + 1;
      // Two CCW-outward triangles per quad (see module header for the axis choice
      // that makes this order outward on every face).
      emitTriangle(p00, p10, p01);
      emitTriangle(p10, p11, p01);
    }
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    // Uint32: one face fits in uint16 (≤2401 verts), but the renderer concatenates
    // all six faces into a single index buffer whose vertex indices run past 65535.
    indices: new Uint32Array(indices),
    tangents: new Float32Array(tangents),
  };
}
