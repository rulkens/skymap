import type { SurfaceTileMesh } from '../../@types/scene/SurfaceTileMesh';
import { earthTileColumns } from './earthTileColumns';
import { equirectUvToDirection } from '../math/equirectUvToDirection';
import { TEXTURE_PRIME_MERIDIAN_U } from '../../data/bodies/texturePrimeMeridianU';
import { EARTH_TILE_PX } from '../../data/bodies/earthTileParams';

/**
 * bakeSurfaceTileMesh — a `resolution x resolution` quad grid over ONE tile's
 * own `[u0,u1]x[v0,v1]` equirect footprint (derived from `id` exactly as
 * `cutSurfaceTiles.ts` derives it — Task 5 sums this mesh with
 * `SurfaceCutTile.originLocal`, so the two must agree). Each vertex is
 * `equirectUvToDirection(uv) - originDir`, `originDir` the SAME `[u0,v0]`
 * corner direction `cutSurfaceTiles` roots `originLocal` at (vertex 0 bakes
 * to exactly `[0,0,0]`) — an f32-safe local offset that dissolves the ~2.4 m
 * equirect-UV quantum at deep zoom (spec §3.3). No seam duplication like
 * `cubeSphereMesh`'s: a tile's `[u0,u1]` never wraps past `[0,1]`.
 */
export function bakeSurfaceTileMesh(
  id: { readonly z: number; readonly x: number; readonly y: number },
  resolution: number,
): SurfaceTileMesh {
  const { z, x, y } = id;
  const cols = earthTileColumns(z, EARTH_TILE_PX);
  const rows = cols / 2;
  const u0 = x / cols;
  const u1 = (x + 1) / cols;
  // Tile rows count south from +90 while mesh v counts north from -90 (same
  // flip cutSurfaceTiles.ts applies): v0 (min) is the tile's SOUTH edge.
  const v0 = 1 - (y + 1) / rows;
  const v1 = 1 - y / rows;

  const originDir = equirectUvToDirection([u0, v0]);

  const row = resolution + 1;
  const positions = new Float32Array(row * row * 3);
  const uvs = new Float32Array(row * row * 2);
  const tangents = new Float32Array(row * row * 3);

  for (let j = 0; j <= resolution; j++) {
    const v = v0 + (j / resolution) * (v1 - v0);
    for (let i = 0; i <= resolution; i++) {
      const u = u0 + (i / resolution) * (u1 - u0);
      const dir = equirectUvToDirection([u, v]);
      const vi = j * row + i;
      positions[vi * 3] = dir[0] - originDir[0];
      positions[vi * 3 + 1] = dir[1] - originDir[1];
      positions[vi * 3 + 2] = dir[2] - originDir[2];
      uvs[vi * 2] = i / resolution;
      uvs[vi * 2 + 1] = j / resolution;
      // Same unit-east tangent as cubeSphereMesh/equirectUvToDirection's own
      // lon convention — latitude-independent, no pole special-case needed.
      const lon = (u - TEXTURE_PRIME_MERIDIAN_U) * 2 * Math.PI;
      tangents[vi * 3] = -Math.sin(lon);
      tangents[vi * 3 + 1] = Math.cos(lon);
      tangents[vi * 3 + 2] = 0;
    }
  }

  const indices = new Uint32Array(resolution * resolution * 6);
  let idx = 0;
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const p00 = j * row + i;
      const p10 = j * row + i + 1;
      const p01 = (j + 1) * row + i;
      const p11 = (j + 1) * row + i + 1;
      // u=east, v=north, east x north = outward normal — same CCW-outward
      // corner order cubeSphereMesh uses for its sAxis x tAxis = normal faces.
      indices[idx++] = p00;
      indices[idx++] = p10;
      indices[idx++] = p01;
      indices[idx++] = p10;
      indices[idx++] = p11;
      indices[idx++] = p01;
    }
  }

  return { positions, uvs, tangents, indices };
}
